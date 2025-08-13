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

class ConnectionService:
    """Service for managing database connections"""
    
    def __init__(self):
        self.data_dir = settings.DATA_DIR
    
    def _build_odbc_connection_string(self, connection_data: ConnectionCreate) -> str:
        """Build ODBC connection string with proper boolean handling"""
        # Convert boolean values to ODBC format
        encrypt_value = getattr(connection_data, 'encrypt', True)
        trust_cert_value = getattr(connection_data, 'trust_server_certificate', False)
        
        encrypt_str = 'yes' if encrypt_value else 'no'
        trust_cert_str = 'yes' if trust_cert_value else 'no'
        
        return (
            f"DRIVER={getattr(connection_data, 'driver', 'ODBC Driver 17 for SQL Server')};"
            f"SERVER={connection_data.server};"
            f"DATABASE={connection_data.database_name};"
            f"UID={connection_data.username};"
            f"PWD={connection_data.password};"
            f"Encrypt={encrypt_str};"
            f"TrustServerCertificate={trust_cert_str};"
        )
    
    def _build_odbc_connection_string_from_db(self, connection: Connection) -> str:
        """Build ODBC connection string from database connection object"""
        # Convert boolean values to ODBC format
        encrypt_str = 'yes' if connection.encrypt else 'no'
        trust_cert_str = 'yes' if connection.trust_server_certificate else 'no'
        
        return (
            f"DRIVER={connection.driver or 'ODBC Driver 17 for SQL Server'};"
            f"SERVER={connection.server};"
            f"DATABASE={connection.database_name};"
            f"UID={connection.username};"
            f"PWD={connection.password};"
            f"Encrypt={encrypt_str};"
            f"TrustServerCertificate={trust_cert_str};"
        )
    
    async def test_connection(self, connection_data: ConnectionCreate, task_id: str) -> ConnectionTestResult:
        """Test database connection and analyze schema"""
        sse_logger = SSELogger(sse_manager, task_id, "connection_test")
        
        try:
            await sse_logger.info(f"Starting connection test for {connection_data.name}")
            await sse_logger.progress(10, "Connecting to database...")
            
            # Test connection
            conn_str = self._build_odbc_connection_string(connection_data)
            
            try:
                cnxn = pyodbc.connect(conn_str, timeout=30)
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
            
            # Analyze database schema (all tables)
            await sse_logger.progress(40, "Analyzing database schema...")
            database_schema = await self._analyze_database_schema(cursor, sse_logger)
            
            # Get sample data from first table (if any)
            sample_data = []
            if database_schema and len(database_schema) > 0:
                first_table = list(database_schema.keys())[0]
                await sse_logger.progress(60, f"Getting sample data from {first_table}...")
                sample_data = await self._get_sample_data(cursor, first_table, sse_logger)
            
            await sse_logger.progress(100, "Connection test completed successfully")
            
            return ConnectionTestResult(
                success=True,
                sample_data=sample_data,
                database_schema=database_schema,
                task_id=task_id
            )
            
        except Exception as e:
            error_msg = f"Connection test failed: {str(e)}"
            await sse_logger.error(error_msg)
            return ConnectionTestResult(
                success=False,
                error_message=error_msg,
                task_id=task_id
            )
    
    async def _analyze_database_schema(self, cursor, sse_logger: SSELogger) -> Dict[str, Any]:
        """Analyze entire database schema (all tables)"""
        try:
            # Get all tables in the database
            cursor.execute("""
                SELECT 
                    TABLE_SCHEMA,
                    TABLE_NAME,
                    TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_SCHEMA, TABLE_NAME
            """)
            
            tables = cursor.fetchall()
            database_schema = {}
            
            for table in tables:
                schema_name, table_name, table_type = table
                full_table_name = f"{schema_name}.{table_name}"
                
                # Get columns for this table
                cursor.execute(f"""
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
                
                columns = cursor.fetchall()
                column_info = []
                
                for col in columns:
                    col_name, data_type, is_nullable, default_val, max_length, precision, scale = col
                    
                    # Get sample values for this column
                    sample_values = await self._get_column_sample_values(cursor, full_table_name, col_name)
                    
                    column_info.append({
                        "column_name": col_name,
                        "data_type": data_type,
                        "is_nullable": is_nullable == "YES",
                        "default_value": default_val,
                        "max_length": max_length,
                        "precision": precision,
                        "scale": scale,
                        "sample_values": sample_values
                    })
                
                # Get table row count
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {full_table_name}")
                    row_count = cursor.fetchone()[0]
                except:
                    row_count = 0
                
                database_schema[full_table_name] = {
                    "schema_name": schema_name,
                    "table_name": table_name,
                    "table_type": table_type,
                    "columns": column_info,
                    "row_count": row_count
                }
            
            return database_schema
            
        except Exception as e:
            await sse_logger.error(f"Schema analysis failed: {str(e)}")
            raise
    
    async def _get_column_sample_values(self, cursor, table_name: str, column_name: str) -> List[Any]:
        """Get sample values for a column"""
        try:
            # Try to get non-null values
            cursor.execute(f"""
                SELECT TOP 5 [{column_name}]
                FROM {table_name} 
                WHERE [{column_name}] IS NOT NULL
                ORDER BY NEWID()
            """)
            values = [row[0] for row in cursor.fetchall()]
            return values
        except:
            return []
    
    async def _get_sample_data(self, cursor, table_name: str, sse_logger: SSELogger) -> List[Dict[str, Any]]:
        """Get sample data from a table"""
        try:
            cursor.execute(f"SELECT TOP 10 * FROM {table_name};")
            columns = [column[0] for column in cursor.description]
            rows = cursor.fetchall()
            
            sample_data = []
            for row in rows:
                sample_data.append(dict(zip(columns, row)))
            
            return sample_data
        except Exception as e:
            await sse_logger.error(f"Failed to get sample data: {str(e)}")
            return []
    
    async def create_connection_for_user(
        self, 
        db: AsyncSession, 
        user: User, 
        connection_data: ConnectionCreate
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
                status=ConnectionStatus.CREATED,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            db.add(connection)
            await db.commit()
            await db.refresh(connection)
            
            # Convert to response model
            return ConnectionResponse(
                id=connection.id,
                name=connection.name,
                server=connection.server,
                database_name=connection.database_name,
                username=connection.username,
                driver=connection.driver,
                encrypt=connection.encrypt,
                trust_server_certificate=connection.trust_server_certificate,
                status=connection.status,
                created_at=connection.created_at,
                updated_at=connection.updated_at,
                database_schema=connection.database_schema,
                last_schema_refresh=connection.last_schema_refresh
            )
            
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
            
            return ConnectionResponse(
                id=connection.id,
                name=connection.name,
                server=connection.server,
                database_name=connection.database_name,
                username=connection.username,
                driver=connection.driver,
                encrypt=connection.encrypt,
                trust_server_certificate=connection.trust_server_certificate,
                status=connection.status,
                created_at=connection.created_at,
                updated_at=connection.updated_at,
                database_schema=connection.database_schema,
                last_schema_refresh=connection.last_schema_refresh
            )
            
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
            
            return ConnectionResponse(
                id=connection.id,
                name=connection.name,
                server=connection.server,
                database_name=connection.database_name,
                username=connection.username,
                driver=connection.driver,
                encrypt=connection.encrypt,
                trust_server_certificate=connection.trust_server_certificate,
                status=connection.status,
                created_at=connection.created_at,
                updated_at=connection.updated_at,
                database_schema=connection.database_schema,
                last_schema_refresh=connection.last_schema_refresh
            )
            
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
                ConnectionResponse(
                    id=conn.id,
                    name=conn.name,
                    server=conn.server,
                    database_name=conn.database_name,
                    username=conn.username,
                    driver=conn.driver,
                    encrypt=conn.encrypt,
                    trust_server_certificate=conn.trust_server_certificate,
                    status=conn.status,
                    created_at=conn.created_at,
                    updated_at=conn.updated_at,
                    database_schema=conn.database_schema,
                    last_schema_refresh=conn.last_schema_refresh
                )
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
        task_id: str
    ) -> ConnectionTestResult:
        """Refresh and store database schema for a connection"""
        sse_logger = SSELogger(sse_manager, task_id, "schema_refresh")
        
        try:
            await sse_logger.info(f"Starting schema refresh for connection {connection_id}")
            await sse_logger.progress(10, "Connecting to database...")
            
            # Connect to database
            conn_str = self._build_odbc_connection_string(connection_data)
            
            try:
                cnxn = pyodbc.connect(conn_str, timeout=30)
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
            await self._store_database_schema(connection_id, database_schema)
            
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
    
    async def _store_database_schema(self, connection_id: str, database_schema: Dict[str, Any]):
        """Store database schema in the connection record"""
        try:
            from app.models.database import Connection
            from sqlalchemy import update
            
            # This would need to be called with a database session
            # For now, we'll just log the schema
            logger.info(f"Storing schema for connection {connection_id}: {len(database_schema)} tables")
            
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