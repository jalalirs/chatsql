import os
import json
import uuid
import shutil
import asyncio
import pyodbc
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from datetime import datetime
import logging

from app.models.database import (
    Connection, TrainingTask, ConnectionStatus, User
)
from app.models.schemas import ConnectionCreate, ConnectionResponse, ConnectionTestResult
from app.models.vanna_models import DatabaseConfig, ColumnInfo
from app.core.sse_manager import sse_manager
from app.utils.sse_utils import SSELogger
from app.config import settings

logger = logging.getLogger(__name__)

class SSELogger:
    """Simple SSE logger for connection operations"""
    def __init__(self, sse_manager, task_id: str, operation: str):
        self.sse_manager = sse_manager
        self.task_id = task_id
        self.operation = operation
    
    async def info(self, message: str):
        await self.sse_manager.send_to_task(self.task_id, f"{self.operation}_info", {"message": message})
    
    async def error(self, message: str):
        await self.sse_manager.send_to_task(self.task_id, f"{self.operation}_error", {"message": message})
    
    async def progress(self, progress: int, message: str):
        await self.sse_manager.send_to_task(self.task_id, f"{self.operation}_progress", {
            "progress": progress,
            "message": message
        })

class ConnectionService:
    """Service for managing database connections"""
    
    def __init__(self):
        self.data_dir = settings.DATA_DIR
    
    def _build_odbc_connection_string(self, connection_data: ConnectionCreate) -> str:
        """Build ODBC connection string for SQL Server"""
        # Base connection string
        conn_str = f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        conn_str += f"SERVER={connection_data.server};"
        conn_str += f"DATABASE={connection_data.database_name};"
        conn_str += f"UID={connection_data.username};"
        conn_str += f"PWD={connection_data.password};"
        
        # Add encryption settings
        if connection_data.encrypt:
            conn_str += "Encrypt=yes;"
        else:
            conn_str += "Encrypt=no;"
        
        if connection_data.trust_server_certificate:
            conn_str += "TrustServerCertificate=yes;"
        
        return conn_str
    
    async def test_connection(self, connection_data: ConnectionCreate, task_id: str = None) -> ConnectionTestResult:
        """Test database connection and return sample data"""
        sse_logger = SSELogger(sse_manager, task_id, "connection_test") if task_id else None
        
        try:
            if sse_logger:
                await sse_logger.info("Testing database connection...")
                await sse_logger.progress(10, "Building connection string...")
            
            # Build connection string
            conn_str = self._build_odbc_connection_string(connection_data)
            
            if sse_logger:
                await sse_logger.progress(30, "Connecting to database...")
            
            # Connect to database
            try:
                cnxn = await asyncio.to_thread(pyodbc.connect, conn_str, timeout=30)
                cursor = cnxn.cursor()
                
                if sse_logger:
                    await sse_logger.progress(50, "Connection successful, analyzing schema...")
                
            except pyodbc.Error as ex:
                error_msg = f"Database connection failed: {str(ex)}"
                if sse_logger:
                    await sse_logger.error(error_msg)
                return ConnectionTestResult(
                    success=False,
                    error_message=error_msg,
                    task_id=task_id
                )
            
            # Analyze database schema
            if sse_logger:
                await sse_logger.progress(70, "Analyzing database schema...")
            
            database_schema = await self._analyze_database_schema(cursor, sse_logger)
            
            # Get sample data from first table if available
            sample_data = []
            column_info = []
            
            if database_schema:
                first_table = next(iter(database_schema.values()))
                table_name = f"{first_table['schema_name']}.{first_table['table_name']}"
                
                if sse_logger:
                    await sse_logger.progress(90, f"Getting sample data from {table_name}...")
                
                sample_data, column_info_list = await self._get_table_sample_data(cursor, table_name)
                
                # Convert column_info list to dictionary format expected by ConnectionTestResult
                column_info = {}
                for col in column_info_list:
                    column_info[col['name']] = {
                        'type': col['type'],
                        'nullable': col['nullable']
                    }
            
            if sse_logger:
                await sse_logger.progress(100, "Connection test completed successfully")
            
            # Close connection
            cursor.close()
            cnxn.close()
            
            return ConnectionTestResult(
                success=True,
                sample_data=sample_data,
                column_info=column_info,
                database_schema=database_schema,
                task_id=task_id
            )
            
        except Exception as e:
            error_msg = f"Connection test failed: {str(e)}"
            if sse_logger:
                await sse_logger.error(error_msg)
            return ConnectionTestResult(
                success=False,
                error_message=error_msg,
                task_id=task_id
            )
    
    async def _analyze_database_schema(self, cursor, sse_logger: SSELogger) -> Dict[str, Any]:
        """Analyze entire database schema (all tables) - Enhanced version with better logging"""
        try:
            await sse_logger.info("Starting comprehensive schema analysis...")
            
            # First, let's see what database we're connected to
            await asyncio.to_thread(cursor.execute, "SELECT DB_NAME() as current_database")
            db_result = await asyncio.to_thread(cursor.fetchone)
            current_db = db_result[0] if db_result else "Unknown"
            await sse_logger.info(f"Connected to database: {current_db}")
            
            # Get all schemas in the database
            await asyncio.to_thread(cursor.execute, """
                SELECT DISTINCT SCHEMA_NAME 
                FROM INFORMATION_SCHEMA.SCHEMATA 
                WHERE SCHEMA_NAME NOT IN ('sys', 'INFORMATION_SCHEMA')
                ORDER BY SCHEMA_NAME
            """)
            schemas = [row[0] for row in await asyncio.to_thread(cursor.fetchall)]
            await sse_logger.info(f"Found schemas: {', '.join(schemas)}")
            
            # Get all tables in the database (including all schemas)
            await asyncio.to_thread(cursor.execute, """
                SELECT 
                    TABLE_SCHEMA,
                    TABLE_NAME,
                    TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE'
                  AND TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
                ORDER BY TABLE_SCHEMA, TABLE_NAME
            """)
            
            tables = await asyncio.to_thread(cursor.fetchall)
            await sse_logger.info(f"Found {len(tables)} tables total")
            
            # Log the first few tables for debugging
            for i, table in enumerate(tables[:10]):
                schema_name, table_name, table_type = table
                await sse_logger.info(f"Table {i+1}: {schema_name}.{table_name} ({table_type})")
            
            if len(tables) > 10:
                await sse_logger.info(f"... and {len(tables) - 10} more tables")
            
            database_schema = {}
            
            for table in tables:
                schema_name, table_name, table_type = table
                full_table_name = f"{schema_name}.{table_name}"
                
                await sse_logger.info(f"Analyzing table: {full_table_name}")
                
                # Get columns for this table
                await asyncio.to_thread(cursor.execute, f"""
                    SELECT 
                        COLUMN_NAME,
                        DATA_TYPE,
                        IS_NULLABLE,
                        COLUMN_DEFAULT,
                        CHARACTER_MAXIMUM_LENGTH,
                        NUMERIC_PRECISION,
                        NUMERIC_SCALE
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_SCHEMA = '{schema_name}' AND TABLE_NAME = '{table_name}'
                    ORDER BY ORDINAL_POSITION
                """)
                
                columns = await asyncio.to_thread(cursor.fetchall)
                column_info = []
                
                for col in columns:
                    col_name, data_type, is_nullable, default_val, max_length, precision, scale = col
                    
                    column_info.append({
                        "column_name": col_name,
                        "data_type": data_type,
                        "is_nullable": is_nullable == "YES",
                        "default_value": default_val,
                        "max_length": max_length,
                        "precision": precision,
                        "scale": scale,
                        "sample_values": []  # Empty for performance
                    })
                
                database_schema[full_table_name] = {
                    "schema_name": schema_name,
                    "table_name": table_name,
                    "table_type": table_type,
                    "columns": column_info,
                    "row_count": 0  # Skip row count for performance
                }
            
            await sse_logger.info(f"Schema analysis complete. Found {len(database_schema)} tables with columns.")
            return database_schema
            
        except Exception as e:
            await sse_logger.error(f"Schema analysis failed: {str(e)}")
            raise
    
    async def _get_column_sample_values(self, cursor, table_name: str, column_name: str) -> List[Any]:
        """Get sample values for a column"""
        try:
            await asyncio.to_thread(cursor.execute, f"SELECT TOP 5 [{column_name}] FROM {table_name} WHERE [{column_name}] IS NOT NULL")
            rows = await asyncio.to_thread(cursor.fetchall)
            return [str(row[0]) for row in rows if row[0] is not None]
        except Exception as e:
            logger.warning(f"Failed to get sample values for {table_name}.{column_name}: {e}")
            return []
    

    
    async def _get_table_sample_data(self, cursor, table_name: str) -> tuple[List[Dict], List[Dict]]:
        """Get sample data and column info for a table"""
        try:
            # Get sample data
            await asyncio.to_thread(cursor.execute, f"SELECT TOP 10 * FROM {table_name};")
            rows = await asyncio.to_thread(cursor.fetchall)
            
            # Get column names
            columns = [column[0] for column in cursor.description]
            
            # Convert to list of dictionaries
            sample_data = []
            for row in rows:
                sample_data.append(dict(zip(columns, row)))
            
            # Get column info
            column_info = []
            for i, column in enumerate(cursor.description):
                column_info.append({
                    "name": column[0],
                    "type": str(column[1]),
                    "nullable": column[6] if len(column) > 6 else True
                })
            
            return sample_data, column_info
            
        except Exception as e:
            logger.error(f"Failed to get sample data for {table_name}: {e}")
            return [], []
    
    async def create_connection_for_user(
        self, 
        db: AsyncSession, 
        user: User, 
        connection_data: ConnectionCreate,
        database_schema: Optional[Dict[str, Any]] = None
    ) -> ConnectionResponse:
        """Create a new connection for a user"""
        try:
            # Create connection object
            connection = Connection(
                id=str(uuid.uuid4()),
                user_id=user.id,
                name=connection_data.name,
                server=connection_data.server,
                database_name=connection_data.database_name,
                username=connection_data.username,
                password=connection_data.password,
                driver=connection_data.driver,
                encrypt=connection_data.encrypt,
                trust_server_certificate=connection_data.trust_server_certificate,
                status=ConnectionStatus.TEST_SUCCESS,
                database_schema=database_schema,
                last_schema_refresh=datetime.utcnow() if database_schema else None,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            db.add(connection)
            await db.commit()
            await db.refresh(connection)
            
            # Convert to response model
            return ConnectionResponse.model_validate({
                **connection.__dict__,
                'id': str(connection.id)
            })
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create connection: {e}")
            raise
    
    async def get_user_connection(
        self, 
        db: AsyncSession, 
        user_id: str, 
        connection_id: str
    ) -> Optional[ConnectionResponse]:
        """Get a connection that belongs to a user"""
        try:
            stmt = select(Connection).where(
                Connection.id == connection_id,
                Connection.user_id == user_id
            )
            result = await db.execute(stmt)
            connection = result.scalar_one_or_none()
            
            if not connection:
                return None
            
            return ConnectionResponse.model_validate({
                **connection.__dict__,
                'id': str(connection.id)
            })
            
        except Exception as e:
            logger.error(f"Failed to get user connection: {e}")
            raise
    
    async def get_connection_by_id(self, db: AsyncSession, connection_id: str) -> Optional[Connection]:
        """Get raw connection object by ID"""
        try:
            stmt = select(Connection).where(Connection.id == connection_id)
            result = await db.execute(stmt)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Failed to get connection by ID: {e}")
            raise
    
    async def get_user_connection_by_name(
        self, 
        db: AsyncSession, 
        user_id: str, 
        name: str
    ) -> Optional[ConnectionResponse]:
        """Get a connection by name that belongs to a user"""
        try:
            stmt = select(Connection).where(
                Connection.user_id == user_id,
                Connection.name == name
            )
            result = await db.execute(stmt)
            connection = result.scalar_one_or_none()
            
            if not connection:
                return None
            
            return ConnectionResponse.model_validate({
                **connection.__dict__,
                'id': str(connection.id)
            })
            
        except Exception as e:
            logger.error(f"Failed to get user connection by name: {e}")
            raise
    
    async def list_user_connections(
        self, 
        db: AsyncSession, 
        user_id: str
    ) -> List[ConnectionResponse]:
        """List all connections for a user"""
        try:
            stmt = select(Connection).where(Connection.user_id == user_id).order_by(Connection.created_at.desc())
            result = await db.execute(stmt)
            connections = result.scalars().all()
            
            return [
                ConnectionResponse.model_validate({
                    **conn.__dict__,
                    'id': str(conn.id)
                })
                for conn in connections
            ]
            
        except Exception as e:
            logger.error(f"Failed to list user connections: {e}")
            raise
    
    async def delete_user_connection(
        self, 
        db: AsyncSession, 
        user_id: str, 
        connection_id: str
    ) -> bool:
        """Delete a connection that belongs to a user"""
        try:
            # First verify the connection belongs to the user
            connection = await self.get_user_connection(db, user_id, connection_id)
            if not connection:
                return False
            
            # First delete all training tasks associated with this connection
            from app.models.database import TrainingTask
            training_tasks_stmt = delete(TrainingTask).where(
                TrainingTask.connection_id == connection_id
            )
            await db.execute(training_tasks_stmt)
            
            # Delete the connection
            stmt = delete(Connection).where(
                Connection.id == connection_id,
                Connection.user_id == user_id
            )
            await db.execute(stmt)
            await db.commit()
            
            return True
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete user connection: {e}")
            raise
    
    async def update_connection_status(
        self, 
        db: AsyncSession, 
        connection_id: str, 
        status: ConnectionStatus
    ) -> bool:
        """Update connection status"""
        try:
            stmt = update(Connection).where(Connection.id == connection_id).values(
                status=status,
                updated_at=datetime.utcnow()
            )
            await db.execute(stmt)
            await db.commit()
            return True
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update connection status: {e}")
            raise
    
    async def refresh_connection_schema(
        self, 
        connection_data: ConnectionCreate, 
        connection_id: str, 
        task_id: str,
        db: AsyncSession
    ) -> ConnectionTestResult:
        """Refresh and store database schema for a connection"""
        sse_logger = SSELogger(sse_manager, task_id, "schema_refresh")
        
        try:
            await sse_logger.info(f"Starting schema refresh for connection {connection_id}")
            await sse_logger.progress(10, "Connecting to database...")
            
            # Connect to database
            conn_str = self._build_odbc_connection_string(connection_data)
            
            try:
                cnxn = await asyncio.to_thread(pyodbc.connect, conn_str, timeout=30)
                cursor = cnxn.cursor()
                await sse_logger.progress(30, "Connection successful, analyzing schema...")
                
            except pyodbc.Error as ex:
                error_msg = f"Database connection failed: {str(ex)}"
                await sse_logger.error(error_msg)
                return ConnectionTestResult(
                    success=False,
                    error_message=error_msg,
                    task_id=task_id
                )
            
            # Analyze database schema
            await sse_logger.progress(50, "Analyzing database schema...")
            database_schema = await self._analyze_database_schema(cursor, sse_logger)
            
            # Store schema in database
            await sse_logger.progress(80, "Storing schema information...")
            await self._store_database_schema(connection_id, database_schema, db)
            
            await sse_logger.progress(100, "Schema refresh completed successfully")
            
            return ConnectionTestResult(
                success=True,
                database_schema=database_schema,
                task_id=task_id
            )
            
        except Exception as e:
            error_msg = f"Schema refresh failed: {str(e)}"
            await sse_logger.error(error_msg)
            return ConnectionTestResult(
                success=False,
                error_message=error_msg,
                task_id=task_id
            )
    
    async def _store_database_schema(self, connection_id: str, database_schema: Dict[str, Any], db: AsyncSession):
        """Store database schema in the connection record"""
        try:
            stmt = update(Connection).where(
                Connection.id == connection_id
            ).values(
                database_schema=database_schema,
                last_schema_refresh=datetime.utcnow()
            )
            
            await db.execute(stmt)
            await db.commit()
            
            logger.info(f"Stored schema for connection {connection_id}: {len(database_schema)} tables")
            
        except Exception as e:
            logger.error(f"Failed to store database schema: {e}")
            raise
    
    async def get_connection_schema(self, db: AsyncSession, connection_id: str) -> Optional[Dict[str, Any]]:
        """Get stored database schema for a connection"""
        try:
            connection = await self.get_connection_by_id(db, connection_id)
            if not connection:
                return None
            
            return connection.database_schema
            
        except Exception as e:
            logger.error(f"Failed to get connection schema: {e}")
            raise
    
    async def list_connection_tables(self, db: AsyncSession, connection_id: str) -> List[Dict[str, Any]]:
        """List all tables in a connection's database"""
        try:
            schema = await self.get_connection_schema(db, connection_id)
            if not schema:
                return []
            
            tables = []
            for table_name, table_info in schema.items():
                tables.append({
                    "table_name": table_name,
                    "schema_name": table_info["schema_name"],
                    "table_name_only": table_info["table_name"],
                    "row_count": table_info["row_count"],
                    "column_count": len(table_info["columns"])
                })
            
            return tables
            
        except Exception as e:
            logger.error(f"Failed to list connection tables: {e}")
            raise
    
    async def get_table_columns(self, db: AsyncSession, connection_id: str, table_name: str) -> List[Dict[str, Any]]:
        """Get columns for a specific table"""
        try:
            schema = await self.get_connection_schema(db, connection_id)
            if not schema or table_name not in schema:
                return []
            
            table_info = schema[table_name]
            return table_info["columns"]
            
        except Exception as e:
            logger.error(f"Failed to get table columns: {e}")
            raise

# Global instance
connection_service = ConnectionService()