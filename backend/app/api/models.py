from fastapi import APIRouter, Depends, HTTPException, Query, Path
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from app.core.database import get_async_db
from app.dependencies import get_current_user
from app.models.schemas import (
    ModelCreate, ModelUpdate, ModelResponse, ModelDetailResponse, ModelListResponse,
    ModelTrackedTableCreate, ModelTrackedTableResponse,
    ModelTrackedColumnCreate, ModelTrackedColumnResponse,
    ModelStatus, ModelStatusUpdateRequest, ModelStatusUpdateResponse
)
from app.services.model_service import ModelService
from app.models.database import User

router = APIRouter(prefix="/models", tags=["models"])

# Model CRUD Operations
@router.post("/", response_model=ModelResponse)
async def create_model(
    model_data: ModelCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Create a new model"""
    try:
        model_service = ModelService(db)
        return await model_service.create_model(model_data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create model: {str(e)}")

@router.get("/", response_model=ModelListResponse)
async def get_models(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[ModelStatus] = Query(None, description="Filter by status"),
    connection_id: Optional[UUID] = Query(None, description="Filter by connection ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Get paginated list of models"""
    try:
        model_service = ModelService(db)
        result = await model_service.get_models(
            user_id=current_user.id,
            page=page,
            per_page=per_page,
            status=status,
            connection_id=connection_id
        )
        return ModelListResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get models: {str(e)}")

@router.get("/{model_id}", response_model=ModelDetailResponse)
async def get_model(
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Get a specific model with all its relationships"""
    try:
        model_service = ModelService(db)
        model = await model_service.get_model(model_id, current_user.id)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        return model
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get model: {str(e)}")

@router.put("/{model_id}", response_model=ModelResponse)
async def update_model(
    model_data: ModelUpdate,
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Update a model"""
    try:
        model_service = ModelService(db)
        model = await model_service.update_model(model_id, current_user.id, model_data)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        return model
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update model: {str(e)}")

@router.delete("/{model_id}")
async def delete_model(
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Delete a model"""
    try:
        model_service = ModelService(db)
        success = await model_service.delete_model(model_id, current_user.id)
        if not success:
            raise HTTPException(status_code=404, detail="Model not found")
        return {"message": "Model deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {str(e)}")

# Model Status Management
@router.patch("/{model_id}/status", response_model=ModelStatusUpdateResponse)
async def update_model_status(
    status_data: ModelStatusUpdateRequest,
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Update model status"""
    try:
        model_service = ModelService(db)
        model = await model_service.update_model(model_id, current_user.id, ModelUpdate(status=status_data.status))
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        return ModelStatusUpdateResponse(model=model, message="Model status updated successfully")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update model status: {str(e)}")

# Model Lifecycle Management
@router.post("/{model_id}/archive")
async def archive_model(
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Archive a model"""
    try:
        model_service = ModelService(db)
        success = await model_service.archive_model(model_id, current_user.id)
        if not success:
            raise HTTPException(status_code=404, detail="Model not found")
        return {"message": "Model archived successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to archive model: {str(e)}")



@router.post("/{model_id}/duplicate", response_model=ModelResponse)
async def duplicate_model(
    model_id: UUID = Path(..., description="Model ID"),
    new_name: str = Query(..., description="Name for the duplicated model"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Duplicate a model with all its configuration"""
    try:
        model_service = ModelService(db)
        model = await model_service.duplicate_model(model_id, current_user.id, new_name)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        return model
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to duplicate model: {str(e)}")

# Tracked Tables Management
@router.post("/{model_id}/tracked-tables", response_model=ModelTrackedTableResponse)
async def add_tracked_table(
    table_data: ModelTrackedTableCreate,
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Add a table to model tracking"""
    try:
        model_service = ModelService(db)
        table = await model_service.add_tracked_table(model_id, current_user.id, table_data)
        return table
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add tracked table: {str(e)}")

@router.get("/{model_id}/tracked-tables", response_model=List[ModelTrackedTableResponse])
async def get_tracked_tables(
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Get all tracked tables for a model"""
    try:
        model_service = ModelService(db)
        return await model_service.get_tracked_tables(model_id, current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get tracked tables: {str(e)}")

@router.delete("/{model_id}/tracked-tables/{table_id}")
async def remove_tracked_table(
    model_id: UUID = Path(..., description="Model ID"),
    table_id: UUID = Path(..., description="Tracked table ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Remove a table from tracking"""
    try:
        model_service = ModelService(db)
        success = await model_service.remove_tracked_table(model_id, current_user.id, table_id)
        if not success:
            raise HTTPException(status_code=404, detail="Tracked table not found")
        return {"message": "Tracked table removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove tracked table: {str(e)}")

# Tracked Columns Management
@router.get("/{model_id}/tracked-tables/{table_id}/columns", response_model=List[ModelTrackedColumnResponse])
async def get_tracked_columns(
    model_id: UUID = Path(..., description="Model ID"),
    table_id: UUID = Path(..., description="Tracked table ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Get tracked columns for a specific table"""
    try:
        model_service = ModelService(db)
        columns = await model_service.get_tracked_columns(model_id, current_user.id, table_id)
        return columns
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get tracked columns: {str(e)}")

@router.put("/{model_id}/tracked-tables/{table_id}/columns", response_model=List[ModelTrackedColumnResponse])
async def update_tracked_columns(
    columns_data: List[ModelTrackedColumnCreate],
    model_id: UUID = Path(..., description="Model ID"),
    table_id: UUID = Path(..., description="Tracked table ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Update tracked columns for a table"""
    try:
        model_service = ModelService(db)
        columns = await model_service.update_tracked_columns(model_id, current_user.id, table_id, columns_data)
        return columns
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update tracked columns: {str(e)}")

@router.post("/{model_id}/tracked-tables/{table_id}/analyze-values")
async def analyze_tracked_column_values(
    model_id: UUID = Path(..., description="Model ID"),
    table_id: UUID = Path(..., description="Tracked table ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Manually trigger value analysis for tracked columns"""
    try:
        model_service = ModelService(db)
        success = await model_service.analyze_tracked_column_values(model_id, current_user.id, table_id)
        return {"success": success, "message": "Value analysis completed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze column values: {str(e)}")
