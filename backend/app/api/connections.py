from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Dict, Any
import uuid
import logging
import asyncio
from datetime import datetime

from app.dependencies import get_db, get_current_active_user, validate_api_key
from app.services.connection_service import connection_service
from app.models.schemas import (
    ConnectionCreate, ConnectionResponse, ConnectionTestRequest, ConnectionTestResult,
    ConnectionListResponse, TaskResponse, ConnectionDeleteResponse,
    SchemaRefreshRequest, SchemaRefreshResponse, ConnectionSchemaResponse
)
from pydantic import BaseModel
from app.models.database import (
    Connection, TrainingTask, ConnectionStatus, User
)
from app.models.vanna_models import VannaConfig, DatabaseConfig
from app.core.sse_manager import sse_manager
from app.utils.file_handler import file_handler
from app.utils.validators import validate_connection_data
from app.config import settings
from app.utils.sse_utils import SSELogger
from app.services.vanna_service import vanna_service

router = APIRouter(prefix="/connections", tags=["Connections"])
logger = logging.getLogger(__name__)

@router.post("/test", response_model=ConnectionTestResult)
async def test_connection(
    request: ConnectionTestRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(validate_api_key)
):
    """Test database connection and analyze schema"""
    try:
        # Validate connection data
        validation_errors = validate_connection_data(request.connection_data)
        if validation_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Validation errors: {', '.join(validation_errors)}"
            )
        
        # Create task for tracking
        task_id = str(uuid.uuid4())
        task = TrainingTask(
            id=task_id,
            connection_id=None,  # No connection yet
            user_id=current_user.id,  # Track user
            task_type="test_connection",
            status="running"
        )
        
        db.add(task)
        await db.commit()
        
        # Start connection test in background
        background_tasks.add_task(
            _run_connection_test,
            request.connection_data,
            task_id,
            current_user
        )
        
        return ConnectionTestResult(
            success=True,
            task_id=task_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Connection test failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Connection test failed: {str(e)}"
        )

@router.post("/{connection_id}/retest")
async def retest_connection(
    connection_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(validate_api_key)
):
    """Retest an existing connection using stored credentials"""
    try:
        # Verify user owns connection
        connection = await connection_service.get_user_connection(db, current_user.id, connection_id)
        if not connection:
            raise HTTPException(status_code=404, detail="Connection not found or access denied")
        
        # Get full connection details from database
        full_connection = await connection_service.get_connection_by_id(db, connection_id)
        if not full_connection:
            raise HTTPException(status_code=404, detail="Connection not found")
        
        # Create connection data using stored credentials
        connection_data = ConnectionCreate(
            name=full_connection.name,
            server=full_connection.server,
            database_name=full_connection.database_name,
            username=full_connection.username,
            password=full_connection.password,  # Use stored password
            driver=full_connection.driver,
            encrypt=full_connection.encrypt,
            trust_server_certificate=full_connection.trust_server_certificate
        )
        
        # Create task for tracking
        task_id = str(uuid.uuid4())
        task = TrainingTask(
            id=task_id,
            connection_id=connection_id,
            user_id=current_user.id,
            task_type="test_connection",
            status="running"
        )
        
        db.add(task)
        await db.commit()
        
        # Start connection test in background
        background_tasks.add_task(
            _run_connection_test,
            connection_data,
            task_id,
            current_user
        )
        
        return {
            "success": True,
            "task_id": task_id,
            "stream_url": f"/events/stream/{task_id}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Connection retest failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
async def _run_connection_test(connection_data: ConnectionCreate, task_id: str, user: User):
    """Background task to run connection test"""
    try:
        # Create a new database session for the background task
        from app.core.database import AsyncSessionLocal
        
        async with AsyncSessionLocal() as db:
            # Update task status
            await _update_task_status(db, task_id, "running", 0)
            
            # Run the actual test
            result = await connection_service.test_connection(connection_data, task_id)
            
            # Update task with result
            if result.success:
                await _update_task_status(db, task_id, "completed", 100)
                await sse_manager.send_to_task(task_id, "test_completed", {
                    "success": True,
                    "sample_data": result.sample_data,
                    "column_info": result.column_info,
                    "task_id": task_id
                })
            else:
                await _update_task_status(db, task_id, "failed", 0, result.error_message)
                await sse_manager.send_to_task(task_id, "test_failed", {
                    "success": False,
                    "error": result.error_message,
                    "task_id": task_id
                })
                
    except Exception as e:
        logger.error(f"Background connection test failed: {e}")
        
        # Create a new session for error handling
        from app.core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await _update_task_status(db, task_id, "failed", 0, str(e))
            await sse_manager.send_to_task(task_id, "test_failed", {
                "success": False,
                "error": str(e),
                "task_id": task_id
            })

@router.post("/", response_model=ConnectionResponse)
async def create_connection(
    name: str = Form(...),
    server: str = Form(...), 
    database_name: str = Form(...),
    username: str = Form(...),
    password: str = Form(...),
    driver: Optional[str] = Form(None),
    encrypt: Optional[bool] = Form(False),
    trust_server_certificate: Optional[bool] = Form(True),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(validate_api_key)
):
    """Create a new database connection for the authenticated user"""
    try:
        # Check if user already has a connection with this name
        existing_connection = await connection_service.get_user_connection_by_name(
            db, current_user.id, name
        )
        if existing_connection:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"You already have a connection named '{name}'"
            )
        
        # Build connection data from form fields
        connection_data = ConnectionCreate(
            name=name,
            server=server,
            database_name=database_name,
            username=username,
            password=password,
            driver=driver,
            encrypt=encrypt,
            trust_server_certificate=trust_server_certificate
        )
        
        # Validate connection data
        validation_errors = validate_connection_data(connection_data)
        if validation_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Validation errors: {', '.join(validation_errors)}"
            )
     
        # Test connection first to get schema
        test_result = await connection_service.test_connection(connection_data, "temp-test")
        
        if not test_result.success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Connection test failed: {test_result.error_message}"
            )
     
        # Create connection for user with discovered schema
        connection = await connection_service.create_connection_for_user(
            db, current_user, connection_data, test_result.database_schema
        )
        
        logger.info(f"Created connection: {connection.id} for user {current_user.email}")
        return connection
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create connection: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create connection: {str(e)}"
        )
    
@router.get("/", response_model=ConnectionListResponse)
async def list_connections(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List current user's connections"""
    try:
        connections = await connection_service.list_user_connections(db, current_user.id)
        return ConnectionListResponse(
            connections=connections,
            total=len(connections)
        )
    except Exception as e:
        logger.error(f"Failed to list connections: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list connections: {str(e)}"
        )

@router.get("/{connection_id}", response_model=ConnectionResponse)
async def get_connection(
    connection_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific connection (must belong to current user)"""
    try:
        connection = await connection_service.get_user_connection(db, current_user.id, connection_id)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found or access denied"
            )
        return connection
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get connection {connection_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get connection: {str(e)}"
        )

@router.delete("/{connection_id}", response_model=ConnectionDeleteResponse)
async def delete_connection(
    connection_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a connection and all associated data (must belong to current user)"""
    # Store user ID to avoid lazy loading issues in error handling
    user_id = str(current_user.id)
    
    try:
        # Check if connection exists and belongs to user
        connection = await connection_service.get_user_connection(db, user_id, connection_id)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found or access denied"
            )
        
        # Delete connection (this will also delete conversations and messages via cascade)
        success = await connection_service.delete_user_connection(db, user_id, connection_id)
        
        if success:
            # Clean up uploaded files
            file_handler.cleanup_connection_files(connection_id)
            
            return ConnectionDeleteResponse(
                success=True,
                message=f"Connection '{connection.name}' deleted successfully"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete connection"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete connection {connection_id} for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete connection: {str(e)}"
        )

# ========================
# SCHEMA DISCOVERY ENDPOINTS
# ========================

@router.post("/{connection_id}/refresh-schema")
async def refresh_connection_schema(
    connection_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(validate_api_key)
):
    """Refresh and store schema information for user's connection"""
    try:
        # Check if connection exists and belongs to user
        connection = await connection_service.get_user_connection(db, current_user.id, connection_id)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found or access denied"
            )
        
        # Create task for tracking
        task_id = str(uuid.uuid4())
        task = TrainingTask(
            id=task_id,
            connection_id=connection_id,
            user_id=current_user.id,
            task_type="refresh_schema",
            status="running"
        )
        
        db.add(task)
        await db.commit()
        
        # Start schema refresh in background
        background_tasks.add_task(
            _run_schema_refresh,
            connection_id,
            task_id,
            current_user
        )
        
        return TaskResponse(
            task_id=task_id,
            connection_id=connection_id,
            task_type="refresh_schema",
            status="running",
            progress=0,
            stream_url=f"/events/stream/{task_id}",
            created_at=task.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start schema refresh: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start schema refresh: {str(e)}"
        )

@router.get("/{connection_id}/schema", response_model=ConnectionSchemaResponse)
async def get_connection_schema(
    connection_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get database schema for user's connection"""
    try:
        # Check if connection exists and belongs to user
        connection = await connection_service.get_user_connection(db, current_user.id, connection_id)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found or access denied"
            )
        
        schema = await connection_service.get_connection_schema(db, connection_id)
        if not schema:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Schema not found. Please refresh schema first."
            )
        
        # Calculate totals
        total_tables = len(schema)
        total_columns = sum(len(table_info.get('columns', [])) for table_info in schema.values())
        
        return ConnectionSchemaResponse(
            connection_id=connection_id,
            connection_name=connection.name,
            schema=schema,
            last_refreshed=connection.last_schema_refresh.isoformat() if connection.last_schema_refresh else None,
            total_tables=total_tables,
            total_columns=total_columns
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get connection schema: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get connection schema: {str(e)}"
        )

@router.get("/{connection_id}/tables")
async def list_connection_tables(
    connection_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List all tables in the database for user's connection"""
    try:
        # Check if connection exists and belongs to user
        connection = await connection_service.get_user_connection(db, current_user.id, connection_id)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found or access denied"
            )
        
        tables = await connection_service.list_connection_tables(db, connection_id)
        return {
            "tables": tables,
            "total": len(tables),
            "connection_id": connection_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list connection tables: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list connection tables: {str(e)}"
        )

@router.get("/{connection_id}/tables/{table_name}/columns")
async def get_table_columns(
    connection_id: str,
    table_name: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get columns for a specific table in user's connection"""
    try:
        # Check if connection exists and belongs to user
        connection = await connection_service.get_user_connection(db, current_user.id, connection_id)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found or access denied"
            )
        
        columns = await connection_service.get_table_columns(db, connection_id, table_name)
        return {
            "columns": columns,
            "total": len(columns),
            "table_name": table_name,
            "connection_id": connection_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get table columns: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get table columns: {str(e)}"
        )

# Background task for schema refresh
async def _run_schema_refresh(
    connection_id: str,
    task_id: str,
    user: User
):
    """Background task to refresh schema"""
    try:
        # Create a new database session for the background task
        from app.core.database import AsyncSessionLocal
        
        async with AsyncSessionLocal() as db:
            await _update_task_status(db, task_id, "running", 0)
            
            # Get connection details
            connection = await connection_service.get_connection_by_id(db, connection_id)
            if not connection:
                raise ValueError("Connection not found")
            
            # Verify user ownership
            if str(connection.user_id) != str(user.id):
                raise ValueError("Access denied: Connection does not belong to user")
            
            # Create connection data for schema analysis
            connection_data = ConnectionCreate(
                name=connection.name,
                server=connection.server,
                database_name=connection.database_name,
                username=connection.username,
                password=connection.password,
                driver=connection.driver,
                encrypt=connection.encrypt,
                trust_server_certificate=connection.trust_server_certificate
            )
            
            # Run schema refresh
            result = await connection_service.refresh_connection_schema(
                connection_data, connection_id, task_id, db
            )
            
            if result.success:
                await _update_task_status(db, task_id, "completed", 100)
                await sse_manager.send_to_task(task_id, "schema_refresh_completed", {
                    "success": True,
                    "connection_id": connection_id,
                    "total_tables": len(result.database_schema) if result.database_schema else 0,
                    "task_id": task_id
                })
            else:
                await _update_task_status(db, task_id, "failed", 0, result.error_message)
                await sse_manager.send_to_task(task_id, "schema_refresh_failed", {
                    "success": False,
                    "error": result.error_message,
                    "task_id": task_id
                })
                
    except Exception as e:
        error_msg = f"Schema refresh failed: {str(e)}"
        logger.error(error_msg)
        
        # Create a new session for error handling
        from app.core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await _update_task_status(db, task_id, "failed", 0, error_msg)
            await sse_manager.send_to_task(task_id, "schema_refresh_failed", {
                "success": False,
                "error": error_msg,
                "task_id": task_id
            })

async def _update_task_status(db: AsyncSession, task_id: str, status: str, progress: int, error_message: str = None):
    """Update task status in database"""
    try:
        from app.models.database import TrainingTask
        from sqlalchemy import update
        from datetime import datetime
        
        stmt = update(TrainingTask).where(TrainingTask.id == task_id).values(
            status=status,
            progress=progress,
            error_message=error_message,
            completed_at=datetime.utcnow() if status in ["completed", "failed"] else None
        )
        await db.execute(stmt)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to update task status: {e}")

# SQL Query Execution Models
class SqlQueryRequest(BaseModel):
    query: str

class SqlQueryResponse(BaseModel):
    success: bool
    results: List[Dict[str, Any]] = []
    columns: List[str] = []
    error: Optional[str] = None
    execution_time_ms: Optional[float] = None

@router.post("/{connection_id}/execute-query", response_model=SqlQueryResponse)
async def execute_sql_query(
    connection_id: str,
    request: SqlQueryRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(validate_api_key)
):
    """Execute a SQL query on the specified connection"""
    try:
        import time
        start_time = time.time()
        
        # Get the connection
        connection = await connection_service.get_connection_by_id(db, connection_id)
        if not connection:
            raise HTTPException(status_code=404, detail="Connection not found")
        
        # Check if user has access to this connection
        if connection.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Check if connection is active
        if connection.status != ConnectionStatus.TEST_SUCCESS:
            raise HTTPException(status_code=400, detail="Connection is not active. Please test the connection first.")
        
        # Execute the query using the connection service
        try:
            results, columns = await connection_service.execute_query(db, connection_id, request.query)
            
            execution_time = (time.time() - start_time) * 1000  # Convert to milliseconds
            
            return SqlQueryResponse(
                success=True,
                results=results,
                columns=columns,
                execution_time_ms=execution_time
            )
            
        except Exception as query_error:
            logger.error(f"Query execution failed: {query_error}")
            execution_time = (time.time() - start_time) * 1000
            
            return SqlQueryResponse(
                success=False,
                error=str(query_error),
                execution_time_ms=execution_time
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to execute SQL query: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to execute query: {str(e)}")