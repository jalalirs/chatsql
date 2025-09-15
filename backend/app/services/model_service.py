from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, select, func
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
from app.services.training_service import TrainingService
import logging

logger = logging.getLogger(__name__)

class ModelService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.connection_service = ConnectionService()
        self.training_service = TrainingService()
    
    async def create_model(self, model_data: ModelCreate, user_id: UUID) -> ModelResponse:
        """Create a new model for a connection"""
        # Verify connection exists and belongs to user
        stmt = select(Connection).where(
            and_(
                Connection.id == model_data.connection_id,
                Connection.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        connection = result.scalar_one_or_none()
        
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
        await self.db.commit()
        await self.db.refresh(db_model)
        
        # Create response without using from_orm to avoid relationship loading issues
        return ModelResponse(
            id=db_model.id,
            connection_id=db_model.connection_id,
            user_id=db_model.user_id,
            name=db_model.name,
            description=db_model.description,
            status=db_model.status,
            created_at=db_model.created_at,
            updated_at=db_model.updated_at
        )
    
    async def get_model(self, model_id: UUID, user_id: UUID) -> Optional[ModelDetailResponse]:
        """Get a model with all its relationships"""
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            return None
        
        # Load tracked tables
        tracked_tables_stmt = select(ModelTrackedTable).where(
            ModelTrackedTable.model_id == model_id
        )
        tracked_tables_result = await self.db.execute(tracked_tables_stmt)
        tracked_tables = tracked_tables_result.scalars().all()
        
        # Load training documentation
        from app.models.database import ModelTrainingDocumentation
        training_docs_stmt = select(ModelTrainingDocumentation).where(
            ModelTrainingDocumentation.model_id == model_id
        )
        training_docs_result = await self.db.execute(training_docs_stmt)
        training_documentation = training_docs_result.scalars().all()
        
        # Load training questions
        from app.models.database import ModelTrainingQuestion
        training_questions_stmt = select(ModelTrainingQuestion).where(
            ModelTrainingQuestion.model_id == model_id
        )
        training_questions_result = await self.db.execute(training_questions_stmt)
        training_questions = training_questions_result.scalars().all()
        
        # Load tracked columns (ModelTrackedColumn, not ModelTrainingColumn) - only those with is_tracked=true
        tracked_columns_stmt = select(ModelTrackedColumn).join(
            ModelTrackedTable, ModelTrackedColumn.model_tracked_table_id == ModelTrackedTable.id
        ).where(
            and_(
                ModelTrackedTable.model_id == model_id,
                ModelTrackedColumn.is_tracked == True
            )
        )
        tracked_columns_result = await self.db.execute(tracked_columns_stmt)
        tracked_columns = tracked_columns_result.scalars().all()
        
        # Create the response with loaded relationships
        return ModelDetailResponse(
            id=model.id,
            connection_id=model.connection_id,
            user_id=model.user_id,
            name=model.name,
            description=model.description,
            status=model.status,
            created_at=model.created_at,
            updated_at=model.updated_at,
            tracked_tables=tracked_tables,
            training_documentation=training_documentation,
            training_questions=training_questions,
            tracked_columns=tracked_columns
        )
    
    async def get_models(self, user_id: UUID, page: int = 1, per_page: int = 20, 
                   status: Optional[ModelStatus] = None, connection_id: Optional[UUID] = None) -> Dict[str, Any]:
        """Get paginated list of models for a user"""
        query = select(Model).where(Model.user_id == user_id)
        
        if status:
            query = query.where(Model.status == status)
        
        if connection_id:
            query = query.where(Model.connection_id == connection_id)
        
        # Get total count
        count_stmt = select(func.count()).select_from(query.subquery())
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar()
        
        # Get paginated results
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        models = result.scalars().all()
        
        return {
            "models": [
                ModelResponse(
                    id=model.id,
                    connection_id=model.connection_id,
                    user_id=model.user_id,
                    name=model.name,
                    description=model.description,
                    status=model.status,
                    created_at=model.created_at,
                    updated_at=model.updated_at
                ) for model in models
            ],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        }
    
    async def update_model(self, model_id: UUID, user_id: UUID, model_data: ModelUpdate) -> Optional[ModelResponse]:
        """Update a model"""
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            return None
        
        # Update fields
        for field, value in model_data.dict(exclude_unset=True).items():
            setattr(model, field, value)
        
        await self.db.commit()
        await self.db.refresh(model)
        
        # Create response without using from_orm to avoid relationship loading issues
        return ModelResponse(
            id=model.id,
            connection_id=model.connection_id,
            user_id=model.user_id,
            name=model.name,
            description=model.description,
            status=model.status,
            created_at=model.created_at,
            updated_at=model.updated_at
        )
    
    async def delete_model(self, model_id: UUID, user_id: UUID) -> bool:
        """Delete a model"""
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            return False
        
        await self.db.delete(model)
        await self.db.commit()
        
        return True
    
    async def archive_model(self, model_id: UUID, user_id: UUID) -> bool:
        """Archive a model"""
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            return False
        
        model.status = ModelStatus.ARCHIVED
        await self.db.commit()
        
        return True
    

    
    async def duplicate_model(self, model_id: UUID, user_id: UUID, new_name: str) -> Optional[ModelResponse]:
        """Duplicate a model with all its configuration"""
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        original_model = result.scalar_one_or_none()
        
        if not original_model:
            return None
        
        # Create new model
        new_model = Model(
            connection_id=original_model.connection_id,
            user_id=user_id,
            name=new_name,
            description=f"Copy of {original_model.description}" if original_model.description else None,
            status=ModelStatus.DRAFT
        )
        
        self.db.add(new_model)
        await self.db.commit()
        await self.db.refresh(new_model)
        
        # Create response without using from_orm to avoid relationship loading issues
        return ModelResponse(
            id=new_model.id,
            connection_id=new_model.connection_id,
            user_id=new_model.user_id,
            name=new_model.name,
            description=new_model.description,
            status=new_model.status,
            created_at=new_model.created_at,
            updated_at=new_model.updated_at
        )
    
    async def add_tracked_table(self, model_id: UUID, user_id: UUID, table_data: ModelTrackedTableCreate) -> ModelTrackedTableResponse:
        """Add a table to model tracking"""
        # Verify model ownership
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            raise ValueError("Model not found or access denied")
        
        # Create tracked table
        tracked_table = ModelTrackedTable(
            model_id=model_id,
            table_name=table_data.table_name,
            schema_name=table_data.schema_name,
            is_active=table_data.is_active
        )
        
        self.db.add(tracked_table)
        await self.db.commit()
        await self.db.refresh(tracked_table)
        
        # Create response without using from_orm to avoid relationship loading issues
        return ModelTrackedTableResponse(
            id=tracked_table.id,
            model_id=tracked_table.model_id,
            table_name=tracked_table.table_name,
            schema_name=tracked_table.schema_name,
            is_active=tracked_table.is_active,
            created_at=tracked_table.created_at
        )
    
    async def get_tracked_tables(self, model_id: UUID, user_id: UUID) -> List[ModelTrackedTableResponse]:
        """Get all tracked tables for a model"""
        # Verify model ownership
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            raise ValueError("Model not found or access denied")
        
        # Get tracked tables
        stmt = select(ModelTrackedTable).where(ModelTrackedTable.model_id == model_id)
        result = await self.db.execute(stmt)
        tables = result.scalars().all()
        
        return [
            ModelTrackedTableResponse(
                id=table.id,
                model_id=table.model_id,
                table_name=table.table_name,
                schema_name=table.schema_name,
                is_active=table.is_active,
                created_at=table.created_at
            ) for table in tables
        ]
    
    async def remove_tracked_table(self, model_id: UUID, user_id: UUID, table_id: UUID) -> bool:
        """Remove a table from tracking"""
        # Verify model ownership
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            return False
        
        # Get tracked table
        stmt = select(ModelTrackedTable).where(
            and_(
                ModelTrackedTable.id == table_id,
                ModelTrackedTable.model_id == model_id
            )
        )
        result = await self.db.execute(stmt)
        tracked_table = result.scalar_one_or_none()
        
        if not tracked_table:
            return False
        
        await self.db.delete(tracked_table)
        await self.db.commit()
        
        return True
    
    async def update_tracked_columns(self, model_id: UUID, user_id: UUID, table_id: UUID, 
                                   columns_data: List[ModelTrackedColumnCreate]) -> List[ModelTrackedColumnResponse]:
        """Update tracked columns for a table"""
        # Verify model ownership
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            raise ValueError("Model not found or access denied")
        
        # Verify table ownership
        stmt = select(ModelTrackedTable).where(
            and_(
                ModelTrackedTable.id == table_id,
                ModelTrackedTable.model_id == model_id
            )
        )
        result = await self.db.execute(stmt)
        tracked_table = result.scalar_one_or_none()
        
        if not tracked_table:
            raise ValueError("Tracked table not found")
        
        # Remove existing columns
        stmt = select(ModelTrackedColumn).where(ModelTrackedColumn.model_tracked_table_id == table_id)
        result = await self.db.execute(stmt)
        existing_columns = result.scalars().all()
        
        for column in existing_columns:
            await self.db.delete(column)
        
        # Add new columns
        new_columns = []
        for col_data in columns_data:
            column = ModelTrackedColumn(
                model_tracked_table_id=table_id,
                column_name=col_data.column_name,
                is_tracked=col_data.is_tracked,
                description=col_data.description
            )
            new_columns.append(column)
            self.db.add(column)
        
        await self.db.commit()
        
        # Refresh columns to get IDs
        for column in new_columns:
            await self.db.refresh(column)
        
        # Analyze and store value information for tracked columns
        if new_columns:
            logger.info(f"Starting value analysis for {len(new_columns)} tracked columns in table {tracked_table.table_name}")
            await self._analyze_and_store_column_values(model_id, tracked_table.table_name, new_columns)
            logger.info(f"Completed value analysis for tracked columns in table {tracked_table.table_name}")
        else:
            logger.info(f"No new columns to analyze for table {tracked_table.table_name}")
        
        return [
            ModelTrackedColumnResponse(
                id=column.id,
                model_tracked_table_id=column.model_tracked_table_id,
                column_name=column.column_name,
                is_tracked=column.is_tracked,
                description=column.description,
                value_categories=column.value_categories,
                value_range_min=column.value_range_min,
                value_range_max=column.value_range_max,
                value_distinct_count=column.value_distinct_count,
                value_data_type=column.value_data_type,
                value_sample_size=column.value_sample_size,
                created_at=column.created_at
            ) for column in new_columns
        ]
    
    async def _analyze_and_store_column_values(self, model_id: UUID, table_name: str, columns: List[ModelTrackedColumn]):
        """Analyze and store value information for tracked columns"""
        try:
            # Get the model to access connection information
            stmt = select(Model).where(Model.id == model_id)
            result = await self.db.execute(stmt)
            model = result.scalar_one_or_none()
            
            if not model:
                logger.error(f"Model not found for value analysis: {model_id}")
                return
            
            # Get connection using the connection service
            connection = await self.connection_service.get_connection_by_id(self.db, str(model.connection_id))
            
            if not connection:
                logger.error(f"Connection not found for model {model_id}")
                return
            
            # Import training service for value analysis
            from app.services.training_service import TrainingService
            training_service = TrainingService()
            training_service.db = self.db  # Set the database session
            
            # Analyze each tracked column
            for column in columns:
                if column.is_tracked:
                    try:
                        # Get column data type from database schema
                        columns_info = await self.connection_service.get_table_columns(self.db, str(model.connection_id), table_name)
                        column_info = next((col for col in columns_info if col['column_name'] == column.column_name), None)
                        
                        if column_info:
                            # Analyze column values
                            value_analysis = await training_service._analyze_column_values(connection, table_name, column.column_name, column_info['data_type'])
                            
                            # Update column with value information
                            if 'categories' in value_analysis:
                                column.value_categories = value_analysis['categories']
                            if 'range' in value_analysis:
                                column.value_range_min = str(value_analysis['range'].get('min', ''))
                                column.value_range_max = str(value_analysis['range'].get('max', ''))
                            if 'date_range' in value_analysis:
                                column.value_range_min = value_analysis['date_range'].get('start', '')
                                column.value_range_max = value_analysis['date_range'].get('end', '')
                            if 'distinct_count' in value_analysis:
                                column.value_distinct_count = value_analysis['distinct_count']
                            if 'is_categorical' in value_analysis:
                                column.value_data_type = 'categorical'
                                # Store low-cardinality flag for categorical columns with 30 or fewer distinct values
                                if value_analysis.get('is_low_cardinality', False):
                                    column.value_is_low_cardinality = True
                            elif 'is_numerical' in value_analysis:
                                column.value_data_type = 'numerical'
                            elif 'is_temporal' in value_analysis:
                                column.value_data_type = 'temporal'
                            elif 'is_high_cardinality' in value_analysis:
                                column.value_data_type = 'high_cardinality'
                                column.value_sample_size = value_analysis.get('sample_size', 20)
                            
                            logger.info(f"Analyzed values for {table_name}.{column.column_name}: {value_analysis}")
                        else:
                            logger.warning(f"Column info not found for {table_name}.{column.column_name}")
                            
                    except Exception as e:
                        logger.error(f"Failed to analyze values for {table_name}.{column.column_name}: {e}")
            
            # Commit all changes
            await self.db.commit()
            
        except Exception as e:
            logger.error(f"Failed to analyze and store column values: {e}")
            await self.db.rollback()
    
    async def analyze_tracked_column_values(self, model_id: UUID, user_id: UUID, table_id: UUID) -> bool:
        """Manually trigger value analysis for existing tracked columns"""
        try:
            # Verify model ownership
            stmt = select(Model).where(
                and_(
                    Model.id == model_id,
                    Model.user_id == user_id
                )
            )
            result = await self.db.execute(stmt)
            model = result.scalar_one_or_none()
            
            if not model:
                raise ValueError("Model not found or access denied")
            
            # Verify table ownership
            stmt = select(ModelTrackedTable).where(
                and_(
                    ModelTrackedTable.id == table_id,
                    ModelTrackedTable.model_id == model_id
                )
            )
            result = await self.db.execute(stmt)
            tracked_table = result.scalar_one_or_none()
            
            if not tracked_table:
                raise ValueError("Tracked table not found")
            
            # Get existing tracked columns
            stmt = select(ModelTrackedColumn).where(
                and_(
                    ModelTrackedColumn.model_tracked_table_id == table_id,
                    ModelTrackedColumn.is_tracked == True
                )
            )
            result = await self.db.execute(stmt)
            columns = result.scalars().all()
            
            if not columns:
                logger.info(f"No tracked columns found for table {tracked_table.table_name}")
                return True
            
            # Analyze and store values for existing columns
            await self._analyze_and_store_column_values(model_id, tracked_table.table_name, columns)
            
            logger.info(f"Successfully analyzed values for {len(columns)} columns in table {tracked_table.table_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to analyze tracked column values: {e}")
            return False
    
    async def get_tracked_columns(self, model_id: UUID, user_id: UUID, table_id: UUID) -> List[ModelTrackedColumnResponse]:
        """Get tracked columns for a specific table"""
        # Verify model ownership
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            raise ValueError("Model not found or access denied")
        
        # Verify table ownership
        stmt = select(ModelTrackedTable).where(
            and_(
                ModelTrackedTable.id == table_id,
                ModelTrackedTable.model_id == model_id
            )
        )
        result = await self.db.execute(stmt)
        tracked_table = result.scalar_one_or_none()
        
        if not tracked_table:
            raise ValueError("Tracked table not found")
        
        # Get tracked columns (only where is_tracked is true)
        stmt = select(ModelTrackedColumn).where(
            and_(
                ModelTrackedColumn.model_tracked_table_id == table_id,
                ModelTrackedColumn.is_tracked == True
            )
        )
        result = await self.db.execute(stmt)
        columns = result.scalars().all()
        
        return [
            ModelTrackedColumnResponse(
                id=column.id,
                model_tracked_table_id=column.model_tracked_table_id,
                column_name=column.column_name,
                is_tracked=column.is_tracked,
                description=column.description,
                value_categories=column.value_categories,
                value_range_min=column.value_range_min,
                value_range_max=column.value_range_max,
                value_distinct_count=column.value_distinct_count,
                value_data_type=column.value_data_type,
                value_sample_size=column.value_sample_size,
                created_at=column.created_at
            ) for column in columns
        ]
    
    async def get_training_data(self, model_id: UUID, user_id: UUID) -> Dict[str, Any]:
        """Get training data for a model"""
        # Verify model ownership
        stmt = select(Model).where(
            and_(
                Model.id == model_id,
                Model.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()
        
        if not model:
            raise ValueError("Model not found or access denied")
        
        # Get training data using the training service
        return await self.training_service.get_model_training_data(self.db, str(model_id))
