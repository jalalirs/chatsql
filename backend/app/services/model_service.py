from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.models.database import (
    Model, ModelTrackedTable, ModelTrackedColumn, 
    Connection, User
)
from app.models.schemas import (
    ModelCreate, ModelUpdate, ModelResponse, ModelDetailResponse,
    ModelTrackedTableCreate, ModelTrackedTableUpdate, ModelTrackedTableResponse,
    ModelTrackedColumnCreate, ModelTrackedColumnUpdate, ModelTrackedColumnResponse,
    ModelStatus
)
from app.services.connection_service import ConnectionService
import logging

logger = logging.getLogger(__name__)

class ModelService:
    def __init__(self, db: Session):
        self.db = db
        self.connection_service = ConnectionService()
    
    def create_model(self, model_data: ModelCreate, user_id: UUID) -> ModelResponse:
        """Create a new model for a connection"""
        # Verify connection exists and belongs to user
        connection = self.db.query(Connection).filter(
            and_(
                Connection.id == model_data.connection_id,
                Connection.user_id == user_id
            )
        ).first()
        
        if not connection:
            raise ValueError("Connection not found or access denied")
        
        # Generate model name if not provided
        if not model_data.name:
            model_data.name = f"Model for {connection.name}"
        
        # Create model
        db_model = Model(
            connection_id=model_data.connection_id,
            user_id=user_id,
            name=model_data.name,
            description=model_data.description,
            status=ModelStatus.DRAFT
        )
        
        self.db.add(db_model)
        self.db.commit()
        self.db.refresh(db_model)
        
        return ModelResponse.from_orm(db_model)
    
    def get_model(self, model_id: UUID, user_id: UUID) -> Optional[ModelDetailResponse]:
        """Get a model with all its relationships"""
        model = self.db.query(Model).filter(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        ).first()
        
        if not model:
            return None
        
        return ModelDetailResponse.from_orm(model)
    
    def get_models(self, user_id: UUID, page: int = 1, per_page: int = 20, 
                   status: Optional[ModelStatus] = None, connection_id: Optional[UUID] = None) -> Dict[str, Any]:
        """Get paginated list of models for a user"""
        query = self.db.query(Model).filter(Model.user_id == user_id)
        
        if status:
            query = query.filter(Model.status == status)
        
        if connection_id:
            query = query.filter(Model.connection_id == connection_id)
        
        total = query.count()
        models = query.offset((page - 1) * per_page).limit(per_page).all()
        
        return {
            "models": [ModelResponse.from_orm(model) for model in models],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        }
    
    def update_model(self, model_id: UUID, user_id: UUID, model_data: ModelUpdate) -> Optional[ModelResponse]:
        """Update a model"""
        model = self.db.query(Model).filter(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        ).first()
        
        if not model:
            return None
        
        # Update fields
        if model_data.name is not None:
            model.name = model_data.name
        if model_data.description is not None:
            model.description = model_data.description
        if model_data.status is not None:
            model.status = model_data.status
        
        self.db.commit()
        self.db.refresh(model)
        
        return ModelResponse.from_orm(model)
    
    def delete_model(self, model_id: UUID, user_id: UUID) -> bool:
        """Delete a model and all its data"""
        model = self.db.query(Model).filter(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        ).first()
        
        if not model:
            return False
        
        # Clean up Vanna data
        try:
            from app.services.vanna_service import vanna_service
            vanna_service.cleanup_model_data(str(model_id))
        except Exception as e:
            logger.error(f"Failed to cleanup Vanna data for model {model_id}: {e}")
        
        # Delete model (cascades to all related data)
        self.db.delete(model)
        self.db.commit()
        
        return True
    
    # Tracked Tables Management
    def add_tracked_table(self, model_id: UUID, user_id: UUID, table_data: ModelTrackedTableCreate) -> ModelTrackedTableResponse:
        """Add a tracked table to a model"""
        # Verify model ownership
        model = self.db.query(Model).filter(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        ).first()
        
        if not model:
            raise ValueError("Model not found or access denied")
        
        # Check if table already exists
        existing = self.db.query(ModelTrackedTable).filter(
            and_(
                ModelTrackedTable.model_id == model_id,
                ModelTrackedTable.table_name == table_data.table_name
            )
        ).first()
        
        if existing:
            raise ValueError(f"Table {table_data.table_name} is already tracked")
        
        # Create tracked table
        tracked_table = ModelTrackedTable(
            model_id=model_id,
            table_name=table_data.table_name,
            schema_name=table_data.schema_name,
            is_active=True
        )
        
        self.db.add(tracked_table)
        self.db.commit()
        self.db.refresh(tracked_table)
        
        return ModelTrackedTableResponse.from_orm(tracked_table)
    
    def get_tracked_tables(self, model_id: UUID, user_id: UUID) -> List[ModelTrackedTableResponse]:
        """Get tracked tables for a model"""
        # Verify model ownership
        model = self.db.query(Model).filter(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        ).first()
        
        if not model:
            return []
        
        tracked_tables = self.db.query(ModelTrackedTable).filter(
            ModelTrackedTable.model_id == model_id
        ).all()
        
        return [ModelTrackedTableResponse.from_orm(table) for table in tracked_tables]
    
    def remove_tracked_table(self, model_id: UUID, user_id: UUID, table_id: UUID) -> bool:
        """Remove a tracked table from a model"""
        # Verify model ownership
        model = self.db.query(Model).filter(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        ).first()
        
        if not model:
            return False
        
        # Find and delete tracked table
        tracked_table = self.db.query(ModelTrackedTable).filter(
            and_(
                ModelTrackedTable.id == table_id,
                ModelTrackedTable.model_id == model_id
            )
        ).first()
        
        if not tracked_table:
            return False
        
        self.db.delete(tracked_table)
        self.db.commit()
        
        return True
    
    # Tracked Columns Management
    def update_tracked_columns(self, model_id: UUID, user_id: UUID, table_id: UUID, 
                              columns_data: List[ModelTrackedColumnCreate]) -> List[ModelTrackedColumnResponse]:
        """Update tracked columns for a table"""
        # Verify model ownership
        model = self.db.query(Model).filter(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        ).first()
        
        if not model:
            raise ValueError("Model not found or access denied")
        
        # Verify table ownership
        tracked_table = self.db.query(ModelTrackedTable).filter(
            and_(
                ModelTrackedTable.id == table_id,
                ModelTrackedTable.model_id == model_id
            )
        ).first()
        
        if not tracked_table:
            raise ValueError("Tracked table not found")
        
        # Delete existing columns for this table
        self.db.query(ModelTrackedColumn).filter(
            ModelTrackedColumn.model_tracked_table_id == table_id
        ).delete()
        
        # Add new columns
        tracked_columns = []
        for col_data in columns_data:
            tracked_column = ModelTrackedColumn(
                model_tracked_table_id=table_id,
                column_name=col_data.column_name,
                is_tracked=col_data.is_tracked,
                description=col_data.description
            )
            self.db.add(tracked_column)
            tracked_columns.append(tracked_column)
        
        self.db.commit()
        
        # Refresh all columns
        for col in tracked_columns:
            self.db.refresh(col)
        
        return [ModelTrackedColumnResponse.from_orm(col) for col in tracked_columns]
    
    # Model Lifecycle Management
    def archive_model(self, model_id: UUID, user_id: UUID) -> bool:
        """Archive a model"""
        model = self.update_model(model_id, user_id, ModelUpdate(status=ModelStatus.ARCHIVED))
        return model is not None
    
    def activate_model(self, model_id: UUID, user_id: UUID) -> bool:
        """Activate a model"""
        model = self.update_model(model_id, user_id, ModelUpdate(status=ModelStatus.ACTIVE))
        return model is not None
    
    def duplicate_model(self, model_id: UUID, user_id: UUID, new_name: str) -> Optional[ModelResponse]:
        """Duplicate a model with all its configuration"""
        # Get original model
        original_model = self.db.query(Model).filter(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        ).first()
        
        if not original_model:
            return None
        
        # Create new model
        new_model = Model(
            connection_id=original_model.connection_id,
            user_id=user_id,
            name=new_name,
            description=f"Copy of {original_model.name}",
            status=ModelStatus.DRAFT
        )
        
        self.db.add(new_model)
        self.db.commit()
        self.db.refresh(new_model)
        
        # Copy tracked tables
        original_tables = self.get_tracked_tables(model_id, user_id)
        for table in original_tables:
            new_table = ModelTrackedTable(
                model_id=new_model.id,
                table_name=table.table_name,
                schema_name=table.schema_name,
                is_active=table.is_active
            )
            self.db.add(new_table)
        
        self.db.commit()
        
        return ModelResponse.from_orm(new_model)

# Global instance
model_service = ModelService(None)  # Will be initialized with proper session
