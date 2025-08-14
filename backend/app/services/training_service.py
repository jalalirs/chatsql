import os
import json
import uuid
import asyncio
import pyodbc
from typing import Optional, List, Dict, Any, Callable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, and_, text
from datetime import datetime
import logging
import openai
import httpx

from app.models.database import (
    Model, ModelTrackedTable, ModelTrackedColumn,
    ModelTrainingDocumentation, ModelTrainingQuestion, ModelTrainingColumn,
    TrainingTask, User, Connection
)
from app.models.schemas import (
    ModelTrainingDocumentationCreate, ModelTrainingDocumentationUpdate, ModelTrainingDocumentationResponse,
    ModelTrainingQuestionCreate, ModelTrainingQuestionUpdate, ModelTrainingQuestionResponse,
    ModelTrainingColumnCreate, ModelTrainingColumnUpdate, ModelTrainingColumnResponse,
    ModelStatus, AIGenerationResult
)
from app.models.vanna_models import (
    DataGenerationConfig, TrainingConfig, GeneratedDataResult, 
    VannaTrainingData, TrainingDocumentation as VannaTrainingDoc, 
    TrainingExample as VannaTrainingExample, MSSQLConstants
)
from app.services.connection_service import connection_service
from app.services.vanna_service import vanna_service
from app.core.sse_manager import sse_manager
from app.utils.sse_utils import SSELogger
from app.config import settings

logger = logging.getLogger(__name__)

class TrainingService:
    """Service for generating training data and training Vanna models with user authentication"""
    
    def __init__(self):
        self.data_dir = settings.DATA_DIR
        self.openai_client = None

    def _get_openai_client(self):
        """Get OpenAI client with configuration"""
        if not self.openai_client:
            self.openai_client = openai.OpenAI(
                base_url=settings.OPENAI_BASE_URL,
                api_key=settings.OPENAI_API_KEY,
                http_client=httpx.Client(verify=False)
            )
        return self.openai_client
    
    def _build_odbc_connection_string(self, connection: Connection) -> str:
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
    
    async def generate_training_data(
        self, 
        db: AsyncSession,
        user: User,
        model_id: str, 
        num_examples: int,
        task_id: str
    ) -> GeneratedDataResult:
        """Generate training data for a user's model"""
        sse_logger = SSELogger(sse_manager, task_id, "data_generation")
        
        try:
            await sse_logger.info(f"Starting data generation for user {user.email}, model {model_id}")
            await sse_logger.progress(5, "Verifying model ownership...")
            
            # Get model and verify ownership
            model = await self._get_model_and_verify_ownership(db, model_id, user)
            if not model:
                raise ValueError(f"Model {model_id} not found or access denied for user {user.email}")
            
            # Get connection for database access
            connection = await connection_service.get_connection_by_id(db, str(model.connection_id))
            if not connection:
                raise ValueError(f"Connection not found for model {model_id}")
            
            # Get tracked tables for this model
            tracked_tables = await self._get_model_tracked_tables(db, model_id)
            if not tracked_tables:
                raise ValueError(f"No tracked tables found for model {model_id}")
            
            await sse_logger.progress(10, f"Found {len(tracked_tables)} tracked tables")
            
            # Update model status
            await self._update_model_status(db, model_id, ModelStatus.TRAINING)
            
            # Generate training data for each tracked table
            total_generated = 0
            failed_count = 0
            
            for table_info in tracked_tables:
                try:
                    await sse_logger.progress(20, f"Generating data for table: {table_info.table_name}")
                    
                    # Generate examples for this table
                    table_examples = await self._generate_table_examples(
                        db, connection, table_info, num_examples // len(tracked_tables), sse_logger
                    )
                    
                    # Save examples to database
                    saved_count = await self._save_training_examples(db, model_id, table_info.table_name, table_examples)
                    total_generated += saved_count
                    
                    await sse_logger.progress(40, f"Generated {saved_count} examples for {table_info.table_name}")
                    
                except Exception as e:
                    failed_count += 1
                    await sse_logger.error(f"Failed to generate data for table {table_info.table_name}: {str(e)}")
                    logger.error(f"Table generation failed for {table_info.table_name}: {e}")
            
            # Generate cross-table examples if multiple tables
            if len(tracked_tables) > 1:
                try:
                    await sse_logger.progress(60, "Generating cross-table examples...")
                    cross_table_examples = await self._generate_cross_table_examples(
                        db, connection, tracked_tables, num_examples // 4, sse_logger
                    )
                    
                    # Save cross-table examples
                    cross_count = await self._save_training_examples(db, model_id, "cross_table", cross_table_examples)
                    total_generated += cross_count
                    
                    await sse_logger.progress(80, f"Generated {cross_count} cross-table examples")
                    
                except Exception as e:
                    await sse_logger.error(f"Failed to generate cross-table examples: {str(e)}")
                    logger.error(f"Cross-table generation failed: {e}")
            
            # Update model status
            await self._update_model_status(db, model_id, ModelStatus.DRAFT)
            
            await sse_logger.progress(100, f"Data generation completed: {total_generated} examples generated")
            
            return GeneratedDataResult(
                success=True,
                total_generated=total_generated,
                failed_count=failed_count,
                examples=[],
                documentation=[],
                generation_time=0.0
            )
            
        except Exception as e:
            error_msg = f"Training data generation failed: {str(e)}"
            await sse_logger.error(error_msg)
            logger.error(error_msg)
            
            # Update model status on failure
            try:
                await self._update_model_status(db, model_id, ModelStatus.DRAFT)
            except:
                pass

            return GeneratedDataResult(
                success=False,
                total_generated=0,
                failed_count=0,
                examples=[],
                documentation=[],
                generation_time=0.0,
                error_message=error_msg
            )
    
    async def generate_column_descriptions(
        self,
        db: AsyncSession,
        user: User,
        model_id: str,
        scope: str,
        table_name: Optional[str] = None,
        column_name: Optional[str] = None,
        additional_instructions: Optional[str] = None
    ) -> AIGenerationResult:
        """Generate AI descriptions for columns at different scopes"""
        try:
            logger.info(f"🔍 generate_column_descriptions called with scope: {scope}, model_id: {model_id}, table_name: {table_name}, column_name: {column_name}")
            # Get model and verify ownership
            model = await self._get_model_and_verify_ownership(db, model_id, user)
            if not model:
                return AIGenerationResult(
                    success=False,
                    generated_count=0,
                    error_message=f"Model {model_id} not found or access denied"
                )
            
            # Get connection for database access
            connection = await connection_service.get_connection_by_id(db, str(model.connection_id))
            if not connection:
                return AIGenerationResult(
                    success=False,
                    generated_count=0,
                    error_message=f"Connection not found for model {model_id}"
                )
            
            generated_count = 0
            
            if scope == "column":
                # Generate description for a specific column
                if not table_name or not column_name:
                    return AIGenerationResult(
                        success=False,
                        generated_count=0,
                        error_message="Table name and column name are required for column scope"
                    )
                
                description = await self._generate_single_column_description(
                    db, connection, table_name, column_name, model_id, additional_instructions
                )
                
                # Update the training column record
                await self._update_column_description(db, model_id, table_name, column_name, description)
                generated_count = 1
                
                # Return the generated description in the response
                generated_descriptions = {column_name: description}
                
            elif scope == "table":
                # Generate descriptions for all tracked columns in a table
                if not table_name:
                    return AIGenerationResult(
                        success=False,
                        generated_count=0,
                        error_message="Table name is required for table scope"
                    )
                
                # Get tracked columns for this table
                tracked_columns = await self._get_model_tracked_columns_for_table(db, model_id, table_name)
                if not tracked_columns:
                    return AIGenerationResult(
                        success=False,
                        generated_count=0,
                        error_message=f"No tracked columns found for table {table_name}"
                    )
                
                descriptions = await self._generate_tracked_column_descriptions(
                    db, connection, table_name, tracked_columns, model_id, additional_instructions
                )
                
                # Update all column descriptions for the table
                for col_name, description in descriptions.items():
                    await self._update_column_description(db, model_id, table_name, col_name, description)
                    generated_count += 1
                
                # Return the generated descriptions in the response
                generated_descriptions = {table_name: descriptions}
                
            elif scope == "all":
                # Generate descriptions for all tracked columns across all tables
                logger.info(f"🔍 Processing 'all' scope for model {model_id}")
                tracked_tables = await self._get_model_tracked_tables(db, model_id)
                logger.info(f"🔍 Found {len(tracked_tables)} tracked tables: {[t.table_name for t in tracked_tables]}")
                
                all_generated_descriptions = {}
                
                for table_info in tracked_tables:
                    logger.info(f"🔍 Processing table: {table_info.table_name}")
                    # Get tracked columns for this table
                    tracked_columns = await self._get_model_tracked_columns_for_table(db, model_id, table_info.table_name)
                    logger.info(f"🔍 Found {len(tracked_columns)} tracked columns for table {table_info.table_name}")
                    if tracked_columns:
                        logger.info(f"🔍 Generating descriptions for {len(tracked_columns)} columns in table {table_info.table_name}")
                        descriptions = await self._generate_tracked_column_descriptions(
                            db, connection, table_info.table_name, tracked_columns, model_id, additional_instructions
                        )
                        logger.info(f"🔍 Generated {len(descriptions)} descriptions for table {table_info.table_name}")
                        
                        # Update all column descriptions for each table
                        for col_name, description in descriptions.items():
                            await self._update_column_description(db, model_id, table_info.table_name, col_name, description)
                            generated_count += 1
                        
                        # Collect descriptions for response
                        all_generated_descriptions[table_info.table_name] = descriptions
                    else:
                        logger.warning(f"⚠️ No tracked columns found for table {table_info.table_name}")
                
                generated_descriptions = all_generated_descriptions
            
            logger.info(f"🔍 generate_column_descriptions completed. Generated {generated_count} descriptions")
            return AIGenerationResult(
                success=True,
                generated_count=generated_count,
                error_message=None,
                generated_descriptions=generated_descriptions
            )
            
        except Exception as e:
            logger.error(f"Failed to generate column descriptions: {e}")
            return AIGenerationResult(
                success=False,
                generated_count=0,
                error_message=str(e)
            )
    
    async def generate_table_descriptions(
        self,
        db: AsyncSession,
        user: User,
        model_id: str,
        table_name: Optional[str] = None,
        additional_instructions: Optional[str] = None
    ) -> AIGenerationResult:
        """Generate AI descriptions for all columns in a table or all tables"""
        try:
            # Get model and verify ownership
            model = await self._get_model_and_verify_ownership(db, model_id, user)
            if not model:
                return AIGenerationResult(
                    success=False,
                    generated_count=0,
                    error_message=f"Model {model_id} not found or access denied"
                )
            
            # Get connection for database access
            connection = await connection_service.get_connection_by_id(db, str(model.connection_id))
            if not connection:
                return AIGenerationResult(
                    success=False,
                    generated_count=0,
                    error_message=f"Connection not found for model {model_id}"
                )
            
            generated_count = 0
            
            if table_name:
                # Generate descriptions for tracked columns in a specific table
                tracked_columns = await self._get_model_tracked_columns_for_table(db, model_id, table_name)
                if not tracked_columns:
                    return AIGenerationResult(
                        success=False,
                        generated_count=0,
                        error_message=f"No tracked columns found for table {table_name}"
                    )
                
                logger.info(f"🔍 generate_table_descriptions: Calling _generate_tracked_column_descriptions for table {table_name}")
                descriptions = await self._generate_tracked_column_descriptions(
                    db, connection, table_name, tracked_columns, model_id, additional_instructions
                )
                logger.info(f"🔍 generate_table_descriptions: Received descriptions: {descriptions}")
                
                # Update all column descriptions for the table
                for col_name, description in descriptions.items():
                    await self._update_column_description(db, model_id, table_name, col_name, description)
                    generated_count += 1
                
                # Return the generated descriptions in the response
                generated_descriptions = {table_name: descriptions}
                logger.info(f"🔍 generate_table_descriptions: Final generated_descriptions: {generated_descriptions}")
            else:
                # Generate descriptions for all tracked tables
                tracked_tables = await self._get_model_tracked_tables(db, model_id)
                all_generated_descriptions = {}
                
                for table_info in tracked_tables:
                    # Get tracked columns for this table
                    tracked_columns = await self._get_model_tracked_columns_for_table(db, model_id, table_info.table_name)
                    if tracked_columns:
                        descriptions = await self._generate_tracked_column_descriptions(
                            db, connection, table_info.table_name, tracked_columns, model_id, additional_instructions
                        )
                        
                        # Update all column descriptions for each table
                        for col_name, description in descriptions.items():
                            await self._update_column_description(db, model_id, table_info.table_name, col_name, description)
                            generated_count += 1
                        
                        # Collect descriptions for response
                        all_generated_descriptions[table_info.table_name] = descriptions
                
                generated_descriptions = all_generated_descriptions
            
            return AIGenerationResult(
                success=True,
                generated_count=generated_count,
                error_message=None,
                generated_descriptions=generated_descriptions
            )
            
        except Exception as e:
            logger.error(f"Failed to generate table descriptions: {e}")
            return AIGenerationResult(
                success=False,
                generated_count=0,
                error_message=str(e)
            )
    
    async def generate_all_descriptions(
        self,
        db: AsyncSession,
        user: User,
        model_id: str,
        additional_instructions: Optional[str] = None
    ) -> AIGenerationResult:
        """Generate AI descriptions for all tracked columns across all tables"""
        return await self.generate_column_descriptions(
            db=db,
            user=user,
            model_id=model_id,
            scope="all",
            additional_instructions=additional_instructions
        )
    
    async def _generate_single_column_description(
        self,
        db: AsyncSession,
        connection: Connection,
        table_name: str,
        column_name: str,
        model_id: str,
        additional_instructions: Optional[str] = None
    ) -> str:
        """Generate AI description for a single column"""
        try:
            logger.info(f"🔍 _generate_single_column_description called for table {table_name}, column {column_name}, model {model_id}")
            client = self._get_openai_client()
            
            # Get column information from database schema
            columns = await connection_service.get_table_columns(
                db=db,
                connection_id=str(connection.id),
                table_name=table_name
            )
            
            column_info = None
            for col in columns:
                if col["column_name"] == column_name:
                    column_info = col
                    break
            
            if not column_info:
                logger.warning(f"⚠️ Column {column_name} not found in table {table_name}")
                return f"Description for {column_name} column"
            
            logger.info(f"🔍 Found column info: {column_info}")
            
            # First, analyze and store column value information
            value_analysis = await self._analyze_column_values(connection, table_name, column_info['column_name'], column_info['data_type'])
            await self._update_column_value_information(db, model_id, table_name, column_info['column_name'], value_analysis)
            
            # Build prompt for column description using stored value information
            enhanced_column_info = {**column_info, **value_analysis}
            prompt = await self._build_column_description_prompt(connection, table_name, enhanced_column_info, additional_instructions)
            
            logger.info(f"🔍 AI Prompt for single column {column_name}: {prompt}")
            
            response = client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a database expert specializing in Microsoft SQL Server. Generate clear, concise descriptions for database columns."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=200
            )
            
            logger.info(f"🔍 AI Response for single column {column_name}: {response.choices[0].message.content}")
            
            description = response.choices[0].message.content.strip()
            return description if description else f"Description for {column_name} column"
            
        except Exception as e:
            logger.error(f"Failed to generate column description: {e}")
            return f"Description for {column_name} column"
    
    async def _get_all_tracked_columns_for_model(self, db: AsyncSession, model_id: str) -> List[Dict[str, Any]]:
        """Get all tracked columns for a model (only where is_tracked is true)"""
        try:
            # Get all tracked tables for this model
            stmt = select(ModelTrackedTable).where(ModelTrackedTable.model_id == model_id)
            result = await db.execute(stmt)
            tracked_tables = result.scalars().all()
            
            all_tracked_columns = []
            
            for tracked_table in tracked_tables:
                # Get tracked columns for this table (only where is_tracked is true)
                stmt = select(ModelTrackedColumn).where(
                    and_(
                        ModelTrackedColumn.model_tracked_table_id == tracked_table.id,
                        ModelTrackedColumn.is_tracked == True
                    )
                )
                result = await db.execute(stmt)
                tracked_columns = result.scalars().all()
                
                for tracked_col in tracked_columns:
                    all_tracked_columns.append({
                        "id": str(tracked_col.id),
                        "table_name": tracked_table.table_name,
                        "column_name": tracked_col.column_name,
                        "data_type": "Unknown",  # ModelTrackedColumn doesn't store this
                        "description": tracked_col.description,
                        "value_range": None,  # ModelTrackedColumn doesn't store this
                        "created_at": tracked_col.created_at.isoformat() if tracked_col.created_at else None
                    })
            
            return all_tracked_columns
        except Exception as e:
            logger.error(f"Failed to get tracked columns for model: {e}")
            return []

    async def _get_model_tracked_columns_for_table(self, db: AsyncSession, model_id: str, table_name: str) -> List[Dict[str, Any]]:
        """Get tracked columns for a specific table in a model"""
        try:
            logger.info(f"🔍 _get_model_tracked_columns_for_table called for model {model_id}, table {table_name}")
            # First find the tracked table for this model and table name
            stmt = select(ModelTrackedTable).where(
                ModelTrackedTable.model_id == model_id,
                ModelTrackedTable.table_name == table_name
            )
            result = await db.execute(stmt)
            tracked_table = result.scalar_one_or_none()
            
            if not tracked_table:
                logger.error(f"Tracked table not found for model {model_id}, table {table_name}")
                return []
            
            logger.info(f"🔍 Found tracked table: {tracked_table.id} for table {table_name}")
            
            # Now get the tracked columns for this table (only where is_tracked is true)
            stmt = select(ModelTrackedColumn).where(
                and_(
                    ModelTrackedColumn.model_tracked_table_id == tracked_table.id,
                    ModelTrackedColumn.is_tracked == True
                )
            )
            result = await db.execute(stmt)
            tracked_columns = result.scalars().all()
            
            logger.info(f"🔍 Found {len(tracked_columns)} tracked columns for table {table_name}")
            
            # Convert to dictionary format for consistency
            columns = []
            for col in tracked_columns:
                columns.append({
                    'column_name': col.column_name,
                    'data_type': 'Unknown',  # ModelTrackedColumn doesn't have data_type
                    'is_nullable': True,     # ModelTrackedColumn doesn't have is_nullable
                    'description': col.description or '',
                    # Value information fields
                    'value_categories': col.value_categories,
                    'value_range_min': col.value_range_min,
                    'value_range_max': col.value_range_max,
                    'value_distinct_count': col.value_distinct_count,
                    'value_data_type': col.value_data_type,
                    'value_sample_size': col.value_sample_size
                })
            
            return columns
            
        except Exception as e:
            logger.error(f"Failed to get tracked columns for table {table_name}: {e}")
            return []

    async def _generate_tracked_column_descriptions(
        self,
        db: AsyncSession,
        connection: Connection,
        table_name: str,
        tracked_columns: List[Dict[str, Any]],
        model_id: str,
        additional_instructions: Optional[str] = None
    ) -> Dict[str, str]:
        """Generate AI descriptions for tracked columns in a table"""
        try:
            client = self._get_openai_client()
            
            if not tracked_columns:
                return {}
            
            # First, analyze and store column value information for all columns
            enhanced_columns = []
            for col in tracked_columns:
                value_analysis = await self._analyze_column_values(connection, table_name, col['column_name'], col['data_type'])
                await self._update_column_value_information(db, model_id, table_name, col['column_name'], value_analysis)
                enhanced_columns.append({**col, **value_analysis})
            
            # Build prompt for tracked column descriptions using stored value information
            prompt = await self._build_table_column_descriptions_prompt(connection, table_name, enhanced_columns, additional_instructions)
            
            logger.info(f"🔍 AI Prompt for table {table_name}: {prompt}")
            
            response = client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a database expert specializing in Microsoft SQL Server. Generate clear, concise descriptions for database columns."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=1000
            )
            
            logger.info(f"🔍 AI Response for table {table_name}: {response.choices[0].message.content}")
            
            # Parse the response to get descriptions for each column
            descriptions = self._parse_column_descriptions_response(response.choices[0].message.content, tracked_columns)
            logger.info(f"🔍 Parsed descriptions for table {table_name}: {descriptions}")
            return descriptions
            
        except Exception as e:
            logger.error(f"Failed to generate tracked column descriptions: {e}")
            return {}

    async def _generate_table_column_descriptions(
        self,
        db: AsyncSession,
        connection: Connection,
        table_name: str
    ) -> Dict[str, str]:
        """Generate AI descriptions for all columns in a table"""
        try:
            client = self._get_openai_client()
            
            # Get all columns for the table
            columns = await connection_service.get_table_columns(
                db=db,
                connection_id=str(connection.id),
                table_name=table_name
            )
            
            if not columns:
                return {}
            
            # Build prompt for table column descriptions
            prompt = self._build_table_column_descriptions_prompt(table_name, columns)
            
            response = client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a database expert specializing in Microsoft SQL Server. Generate clear, concise descriptions for database columns."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=1000
            )
            
            # Parse the response to get descriptions for each column
            descriptions = self._parse_column_descriptions_response(response.choices[0].message.content, columns)
            return descriptions
            
        except Exception as e:
            logger.error(f"Failed to generate table column descriptions: {e}")
            return {}
    
    async def _build_column_description_prompt(self, connection: Connection, table_name: str, column_info: Dict[str, Any], additional_instructions: str = None) -> str:
        """Build prompt for single column description generation"""
        template_path = "app/prompts/training/column_description.txt"
        try:
            with open(template_path, 'r') as f:
                template = f.read()
        except FileNotFoundError:
            logger.error(f"Prompt template not found: {template_path}")
            raise FileNotFoundError(f"Prompt template not found: {template_path}")
        
        additional_instructions_placeholder = f"\nAdditional Instructions:\n{additional_instructions}" if additional_instructions else ""
        
        # Get value information from stored data
        value_info = self._get_column_value_info(column_info)
        
        # Debug logging
        logger.info(f"Column: {column_info['column_name']}, Value Info: {value_info}")
        
        value_info_placeholder = f"\nValue Information:\n{value_info}" if value_info else ""
        
        final_prompt = template.format(
            table_name=table_name,
            column_name=column_info['column_name'],
            data_type=column_info['data_type'],
            is_nullable=column_info.get('is_nullable', 'Unknown'),
            value_info_placeholder=value_info_placeholder,
            additional_instructions_placeholder=additional_instructions_placeholder
        )
        
        # Debug logging
        logger.info(f"Final prompt for {column_info['column_name']}:\n{final_prompt}")
        
        return final_prompt
    
    async def _build_table_column_descriptions_prompt(self, connection: Connection, table_name: str, columns: List[Dict[str, Any]], additional_instructions: str = None) -> str:
        """Build prompt for table column descriptions generation"""
        template_path = "app/prompts/training/table_column_descriptions.txt"
        try:
            with open(template_path, 'r') as f:
                template = f.read()
        except FileNotFoundError:
            logger.error(f"Prompt template not found: {template_path}")
            raise FileNotFoundError(f"Prompt template not found: {template_path}")
        
        # Build columns text with value information
        columns_with_values = []
        for col in columns:
            # Get value information from stored data
            value_info = self._get_column_value_info(col)
            value_text = f" - Values: {value_info}" if value_info else ""
            columns_with_values.append(
                f"- {col['column_name']} ({col['data_type']}) - Nullable: {col.get('is_nullable', 'Unknown')}{value_text}"
            )
        
        columns_text = "\n".join(columns_with_values)
        
        additional_instructions_placeholder = f"\nAdditional Instructions:\n{additional_instructions}" if additional_instructions else ""
        
        return template.format(
            table_name=table_name,
            columns_text=columns_text,
            additional_instructions_placeholder=additional_instructions_placeholder
        )
    
    async def _analyze_column_values(self, connection: Connection, table_name: str, column_name: str, data_type: str) -> Dict[str, Any]:
        """Analyze column values to determine categories, ranges, etc."""
        try:
            logger.info(f"Analyzing column values for {table_name}.{column_name} (type: {data_type})")
            
            # Skip analysis for certain data types to avoid performance issues
            if data_type.lower() in ['text', 'ntext', 'image', 'varbinary', 'binary']:
                logger.info(f"Skipping analysis for data type: {data_type}")
                return {}
            
            # Build connection string and connect to database
            conn_str = self._build_odbc_connection_string(connection)
            cnxn = await asyncio.to_thread(pyodbc.connect, conn_str, timeout=30)
            cursor = cnxn.cursor()
            
            try:
                # Get distinct values count
                await asyncio.to_thread(cursor.execute, f"SELECT COUNT(DISTINCT [{column_name}]) FROM {table_name} WHERE [{column_name}] IS NOT NULL")
                distinct_count = await asyncio.to_thread(cursor.fetchone)
                distinct_count = distinct_count[0] if distinct_count else 0
                
                # For categorical data (low distinct count or string types)
                if distinct_count <= 50 or data_type.lower() in ['varchar', 'nvarchar', 'char', 'nchar']:
                    # Get all distinct values (up to 20 for display)
                    await asyncio.to_thread(cursor.execute, f"SELECT DISTINCT TOP 20 [{column_name}] FROM {table_name} WHERE [{column_name}] IS NOT NULL ORDER BY [{column_name}]")
                    distinct_values = await asyncio.to_thread(cursor.fetchall)
                    categories = [str(row[0]) for row in distinct_values if row[0] is not None]
                    
                    return {
                        'categories': categories,
                        'distinct_count': distinct_count,
                        'is_categorical': True
                    }
                
                # For numerical data
                elif data_type.lower() in ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney']:
                    # Get min and max values
                    await asyncio.to_thread(cursor.execute, f"SELECT MIN([{column_name}]), MAX([{column_name}]) FROM {table_name} WHERE [{column_name}] IS NOT NULL")
                    min_max = await asyncio.to_thread(cursor.fetchone)
                    
                    if min_max and min_max[0] is not None and min_max[1] is not None:
                        return {
                            'range': {
                                'min': min_max[0],
                                'max': min_max[1]
                            },
                            'distinct_count': distinct_count,
                            'is_numerical': True
                        }
                
                # For date/time data
                elif data_type.lower() in ['date', 'datetime', 'datetime2', 'smalldatetime', 'time']:
                    # Get min and max dates
                    await asyncio.to_thread(cursor.execute, f"SELECT MIN([{column_name}]), MAX([{column_name}]) FROM {table_name} WHERE [{column_name}] IS NOT NULL")
                    min_max = await asyncio.to_thread(cursor.fetchone)
                    
                    if min_max and min_max[0] is not None and min_max[1] is not None:
                        return {
                            'date_range': {
                                'start': str(min_max[0]),
                                'end': str(min_max[1])
                            },
                            'distinct_count': distinct_count,
                            'is_temporal': True
                        }
                
                # For high-cardinality string columns, get a sample
                elif distinct_count > 50:
                    await asyncio.to_thread(cursor.execute, f"SELECT TOP 20 [{column_name}] FROM {table_name} WHERE [{column_name}] IS NOT NULL ORDER BY NEWID()")
                    sample_values = await asyncio.to_thread(cursor.fetchall)
                    categories = [str(row[0]) for row in sample_values if row[0] is not None]
                    
                    return {
                        'categories': categories,
                        'distinct_count': distinct_count,
                        'is_high_cardinality': True,
                        'sample_size': 20
                    }
                
                return {
                    'distinct_count': distinct_count
                }
                
            finally:
                cnxn.close()
                
        except Exception as e:
            logger.warning(f"Failed to analyze column values for {table_name}.{column_name}: {e}")
            return {}
    
    def _get_column_value_info(self, column_info: Dict[str, Any]) -> str:
        """Get value information for a column from stored data"""
        try:
            # Check if we have stored value categories
            if column_info.get('value_categories'):
                categories = column_info['value_categories']
                distinct_count = column_info.get('value_distinct_count', len(categories))
                data_type = column_info.get('value_data_type', 'categorical')
                
                if data_type == 'high_cardinality':
                    sample_size = column_info.get('value_sample_size', 20)
                    return f"Categories (sample of {sample_size} from {distinct_count} distinct): {', '.join(map(str, categories))} ... and {distinct_count - sample_size} more"
                else:
                    return f"Categories ({distinct_count} distinct): {', '.join(map(str, categories))}"
            
            # Check if we have stored range information (numerical data)
            if column_info.get('value_range_min') or column_info.get('value_range_max'):
                min_val = column_info.get('value_range_min')
                max_val = column_info.get('value_range_max')
                distinct_count = column_info.get('value_distinct_count', 0)
                
                if min_val and max_val:
                    return f"Range: {min_val} to {max_val} ({distinct_count} distinct values)"
                elif min_val:
                    return f"Min: {min_val} ({distinct_count} distinct values)"
                elif max_val:
                    return f"Max: {max_val} ({distinct_count} distinct values)"
            
            # Check if we have distinct count but no other info
            if column_info.get('value_distinct_count') and column_info['value_distinct_count'] > 0:
                return f"Distinct values: {column_info['value_distinct_count']}"
            
            return ""
            
        except Exception as e:
            logger.error(f"Failed to get column value info: {e}")
            return ""
    
    def _parse_column_descriptions_response(self, response: str, columns: List[Dict[str, Any]]) -> Dict[str, str]:
        """Parse AI response to extract column descriptions"""
        descriptions = {}
        lines = response.strip().split('\n')
        
        current_column = None
        current_description = None
        
        for line in lines:
            line = line.strip()
            if line.startswith('Column:'):
                # Save previous description if exists
                if current_column and current_description:
                    descriptions[current_column] = current_description
                
                current_column = line.replace('Column:', '').strip()
                current_description = None
                
            elif line.startswith('Description:'):
                current_description = line.replace('Description:', '').strip()
        
        # Add last description
        if current_column and current_description:
            descriptions[current_column] = current_description
        
        # Ensure all columns have descriptions (fallback)
        for col in columns:
            col_name = col['column_name']
            if col_name not in descriptions:
                descriptions[col_name] = f"Description for {col_name} column"
        
        return descriptions
    
    async def _update_column_description(
        self,
        db: AsyncSession,
        model_id: str,
        table_name: str,
        column_name: str,
        description: str
    ):
        """Update tracked column description with AI-generated description"""
        try:
            # Find the tracked table for this model and table name
            stmt = select(ModelTrackedTable).where(
                ModelTrackedTable.model_id == model_id,
                ModelTrackedTable.table_name == table_name
            )
            result = await db.execute(stmt)
            tracked_table = result.scalar_one_or_none()
            
            if not tracked_table:
                logger.error(f"Tracked table not found for model {model_id}, table {table_name}")
                return
            
            # Find the tracked column
            stmt = select(ModelTrackedColumn).where(
                ModelTrackedColumn.model_tracked_table_id == tracked_table.id,
                ModelTrackedColumn.column_name == column_name
            )
            result = await db.execute(stmt)
            tracked_column = result.scalar_one_or_none()
            
            if tracked_column:
                # Update the tracked column description
                tracked_column.description = description
                await db.commit()
                logger.info(f"Updated description for column {column_name} in table {table_name}")
            else:
                logger.error(f"Tracked column not found: {column_name} in table {table_name}")
            
        except Exception as e:
            logger.error(f"Failed to update column description: {e}")
            await db.rollback()
    
    async def _update_column_value_information(
        self,
        db: AsyncSession,
        model_id: str,
        table_name: str,
        column_name: str,
        value_analysis: Dict[str, Any]
    ):
        """Update column value information in the database"""
        try:
            # Find the tracked table for this model and table name
            stmt = select(ModelTrackedTable).where(
                ModelTrackedTable.model_id == model_id,
                ModelTrackedTable.table_name == table_name
            )
            result = await db.execute(stmt)
            tracked_table = result.scalar_one_or_none()
            
            if not tracked_table:
                logger.error(f"Tracked table not found for model {model_id}, table {table_name}")
                return
            
            # Find the tracked column
            stmt = select(ModelTrackedColumn).where(
                ModelTrackedColumn.model_tracked_table_id == tracked_table.id,
                ModelTrackedColumn.column_name == column_name
            )
            result = await db.execute(stmt)
            tracked_column = result.scalar_one_or_none()
            
            if tracked_column:
                # Update value information fields
                if 'categories' in value_analysis:
                    tracked_column.value_categories = value_analysis['categories']
                if 'range' in value_analysis:
                    tracked_column.value_range_min = str(value_analysis['range'].get('min', ''))
                    tracked_column.value_range_max = str(value_analysis['range'].get('max', ''))
                if 'date_range' in value_analysis:
                    tracked_column.value_range_min = value_analysis['date_range'].get('start', '')
                    tracked_column.value_range_max = value_analysis['date_range'].get('end', '')
                if 'distinct_count' in value_analysis:
                    tracked_column.value_distinct_count = value_analysis['distinct_count']
                if 'is_categorical' in value_analysis:
                    tracked_column.value_data_type = 'categorical'
                elif 'is_numerical' in value_analysis:
                    tracked_column.value_data_type = 'numerical'
                elif 'is_temporal' in value_analysis:
                    tracked_column.value_data_type = 'temporal'
                elif 'is_high_cardinality' in value_analysis:
                    tracked_column.value_data_type = 'high_cardinality'
                    tracked_column.value_sample_size = value_analysis.get('sample_size', 20)
                
                await db.commit()
                logger.info(f"Updated value information for {table_name}.{column_name}")
            else:
                logger.warning(f"Tracked column not found: {table_name}.{column_name}")
                
        except Exception as e:
            logger.error(f"Failed to update column value information: {e}")
            await db.rollback()
    
    async def _get_model_and_verify_ownership(self, db: AsyncSession, model_id: str, user: User) -> Optional[Model]:
        """Get model and verify user ownership"""
        try:
            stmt = select(Model).where(
                Model.id == model_id,
                Model.user_id == user.id
            )
            result = await db.execute(stmt)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Failed to get model {model_id}: {e}")
            return None
    
    async def _get_model_tracked_tables(self, db: AsyncSession, model_id: str) -> List[ModelTrackedTable]:
        """Get tracked tables for a model"""
        try:
            stmt = select(ModelTrackedTable).where(
                ModelTrackedTable.model_id == model_id,
                ModelTrackedTable.is_active == True
            )
            result = await db.execute(stmt)
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Failed to get tracked tables for model {model_id}: {e}")
            return []
    
    async def _generate_table_examples(
        self, 
        db: AsyncSession, 
        connection: Connection, 
        table_info: ModelTrackedTable, 
        num_examples: int, 
        sse_logger: SSELogger
    ) -> List[Dict[str, Any]]:
        """Generate training examples for a single table"""
        try:
            # Connect to database
            conn_str = self._build_odbc_connection_string(connection)
            cnxn = await asyncio.to_thread(pyodbc.connect, conn_str, timeout=30)
            cursor = cnxn.cursor()
            
            # Get table schema
            full_table_name = f"{table_info.schema_name}.{table_info.table_name}"
            await sse_logger.info(f"Analyzing schema for table: {full_table_name}")
            
            # Get columns for this table
            await asyncio.to_thread(cursor.execute, f"""
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = '{table_info.schema_name}' AND TABLE_NAME = '{table_info.table_name}'
                ORDER BY ORDINAL_POSITION
            """)
            
            columns = await asyncio.to_thread(cursor.fetchall)
            column_info = []
            
            for col in columns:
                col_name, data_type, is_nullable = col
                
                # Get sample values for this column
                sample_values = await self._get_column_sample_values(cursor, full_table_name, col_name)
                
                column_info.append({
                    "column_name": col_name,
                    "data_type": data_type,
                    "is_nullable": is_nullable == "YES",
                    "sample_values": sample_values
                })
            
            # Generate examples using AI
            examples = await self._generate_ai_examples(
                table_info.table_name, column_info, num_examples, sse_logger
            )
            
            cnxn.close()
            return examples
            
        except Exception as e:
            logger.error(f"Failed to generate examples for table {table_info.table_name}: {e}")
            return []
    
    async def _generate_cross_table_examples(
        self, 
        db: AsyncSession, 
        connection: Connection, 
        tracked_tables: List[ModelTrackedTable], 
        num_examples: int, 
        sse_logger: SSELogger
    ) -> List[Dict[str, Any]]:
        """Generate cross-table training examples"""
        try:
            # Get table relationships and generate join examples
            table_names = [f"{t.schema_name}.{t.table_name}" for t in tracked_tables]
            
            # Generate cross-table examples using AI
            examples = await self._generate_cross_table_ai_examples(
                table_names, num_examples, sse_logger
            )
            
            return examples
            
        except Exception as e:
            logger.error(f"Failed to generate cross-table examples: {e}")
            return []
                
    async def _get_column_sample_values(self, cursor, table_name: str, column_name: str) -> List[Any]:
        """Get sample values for a column"""
        try:
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
    
    async def _generate_ai_examples(
        self, 
        table_name: str, 
        column_info: List[Dict[str, Any]], 
        num_examples: int, 
        sse_logger: SSELogger
    ) -> List[Dict[str, Any]]:
        """Generate training examples using AI"""
        try:
            client = self._get_openai_client()
            
            # Build prompt for AI
            prompt = self._build_example_generation_prompt(table_name, column_info, num_examples)
            
            await sse_logger.info(f"Generating {num_examples} examples using AI...")
            
            response = client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a SQL expert specializing in Microsoft SQL Server."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=2000
            )
            
            # Parse AI response
            examples = self._parse_ai_examples_response(response.choices[0].message.content)
            
            return examples[:num_examples]  # Ensure we don't exceed requested count
            
        except Exception as e:
            logger.error(f"AI example generation failed: {e}")
            return []
    
    async def _generate_cross_table_ai_examples(
        self, 
        table_names: List[str], 
        num_examples: int,
        sse_logger: SSELogger
    ) -> List[Dict[str, Any]]:
        """Generate cross-table examples using AI"""
        try:
            client = self._get_openai_client()
            
            # Build cross-table prompt
            prompt = self._build_cross_table_prompt(table_names, num_examples)
            
            await sse_logger.info(f"Generating {num_examples} cross-table examples using AI...")
            
            response = client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a SQL expert specializing in Microsoft SQL Server joins and cross-table queries."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=2000
            )
            
            # Parse AI response
            examples = self._parse_ai_examples_response(response.choices[0].message.content)
            
            return examples[:num_examples]
            
        except Exception as e:
            logger.error(f"Cross-table AI generation failed: {e}")
            return []
    
    def _build_example_generation_prompt(self, table_name: str, column_info: List[Dict[str, Any]], num_examples: int) -> str:
        """Build prompt for example generation"""
        columns_text = "\n".join([
            f"- {col['column_name']} ({col['data_type']}) - Sample values: {col['sample_values'][:3]}"
            for col in column_info
        ])
        
        return f"""Generate {num_examples} natural language questions and their corresponding SQL queries for the table: {table_name}.

Table columns:
{columns_text}

Your task is to generate a natural language question and its corresponding SQL query for the table: {table_name}.

Guidelines:
- Use Microsoft SQL Server syntax (square brackets for identifiers, TOP N instead of LIMIT)
- Questions should be realistic and varied (filtering, aggregation, sorting, etc.)
- SQL should be correct and executable
- Include a mix of simple and complex queries
- Use appropriate WHERE clauses, GROUP BY, ORDER BY as needed

Format each example as:
Question: [natural language question]
SQL: [corresponding SQL query]

Generate exactly {num_examples} examples:"""
    
    def _build_cross_table_prompt(self, table_names: List[str], num_examples: int) -> str:
        """Build prompt for cross-table example generation"""
        tables_text = "\n".join([f"- {table}" for table in table_names])
        
        return f"""Generate {num_examples} natural language questions and their corresponding SQL queries that involve JOINs between these tables:

Tables:
{tables_text}

Your task is to generate questions that require joining multiple tables to answer.

Guidelines:
- Use Microsoft SQL Server syntax
- Questions should require data from multiple tables
- Use appropriate JOIN types (INNER, LEFT, RIGHT)
- Include realistic business scenarios
- SQL should be correct and executable

Format each example as:
Question: [natural language question]
SQL: [corresponding SQL query with JOINs]

Generate exactly {num_examples} examples:"""
    
    def _parse_ai_examples_response(self, response: str) -> List[Dict[str, Any]]:
        """Parse AI response into structured examples"""
        examples = []
        lines = response.strip().split('\n')
        
        current_question = None
        current_sql = None
        
        for line in lines:
            line = line.strip()
            if line.startswith('Question:'):
                # Save previous example if exists
                if current_question and current_sql:
                    examples.append({
                        "question": current_question,
                        "sql": current_sql
                    })
                
                current_question = line.replace('Question:', '').strip()
                current_sql = None
                
            elif line.startswith('SQL:'):
                current_sql = line.replace('SQL:', '').strip()
        
        # Add last example
        if current_question and current_sql:
            examples.append({
                "question": current_question,
                "sql": current_sql
            })
        
        return examples
    
    async def _save_training_examples(self, db: AsyncSession, model_id: str, table_name: str, examples: List[Dict[str, Any]]) -> int:
        """Save training examples to database"""
        try:
            saved_count = 0
            
            for example in examples:
                training_question = ModelTrainingQuestion(
                    model_id=model_id,
                    question=example["question"],
                    sql=example["sql"],
                    table_name=table_name
                )
                
                db.add(training_question)
                saved_count += 1
            
            await db.commit()
            return saved_count
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to save training examples: {e}")
            return 0
    
    async def _update_model_status(self, db: AsyncSession, model_id: str, status: ModelStatus):
        """Update model status"""
        try:
            stmt = update(Model).where(Model.id == model_id).values(
                status=status,
                updated_at=datetime.utcnow()
            )
            await db.execute(stmt)
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to update model status: {e}")
    
    # Model training data management methods
    async def get_model_training_documentation(self, db: AsyncSession, model_id: str) -> List[ModelTrainingDocumentationResponse]:
        """Get training documentation for a model"""
        try:
            stmt = select(ModelTrainingDocumentation).where(
                ModelTrainingDocumentation.model_id == model_id
            ).order_by(ModelTrainingDocumentation.order_index)
            
            result = await db.execute(stmt)
            docs = result.scalars().all()
            
            return [
                ModelTrainingDocumentationResponse(
                    id=str(doc.id),
                    model_id=str(doc.model_id),
                    title=doc.title,
                    doc_type=doc.doc_type,
                    content=doc.content,
                    category=doc.category,
                    order_index=doc.order_index,
                    created_at=doc.created_at,
                    updated_at=doc.updated_at
                )
                for doc in docs
            ]
        except Exception as e:
            logger.error(f"Failed to get training documentation: {e}")
            return []

    async def create_training_documentation(
        self, 
        db: AsyncSession, 
        model_id: str, 
        doc_data: ModelTrainingDocumentationCreate
    ) -> ModelTrainingDocumentationResponse:
        """Create new training documentation"""
        try:
            doc = ModelTrainingDocumentation(
                model_id=model_id,
                title=doc_data.title,
                doc_type=doc_data.doc_type,
                content=doc_data.content,
                category=doc_data.category,
                order_index=doc_data.order_index
            )
            
            db.add(doc)
            await db.commit()
            await db.refresh(doc)
            
            return ModelTrainingDocumentationResponse(
                id=str(doc.id),
                model_id=str(doc.model_id),
                title=doc.title,
                doc_type=doc.doc_type,
                content=doc.content,
                category=doc.category,
                order_index=doc.order_index,
                created_at=doc.created_at,
                updated_at=doc.updated_at
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create training documentation: {e}")
            raise

    async def update_training_documentation(
        self, 
        db: AsyncSession, 
        doc_id: str, 
        doc_data: ModelTrainingDocumentationUpdate
    ) -> Optional[ModelTrainingDocumentationResponse]:
        """Update training documentation"""
        try:
            stmt = select(ModelTrainingDocumentation).where(ModelTrainingDocumentation.id == doc_id)
            result = await db.execute(stmt)
            doc = result.scalar_one_or_none()
            
            if not doc:
                return None
            
            # Update fields
            if doc_data.title is not None:
                doc.title = doc_data.title
            if doc_data.doc_type is not None:
                doc.doc_type = doc_data.doc_type
            if doc_data.content is not None:
                doc.content = doc_data.content
            if doc_data.category is not None:
                doc.category = doc_data.category
            if doc_data.order_index is not None:
                doc.order_index = doc_data.order_index
            
            await db.commit()
            await db.refresh(doc)
            
            return ModelTrainingDocumentationResponse(
                id=str(doc.id),
                model_id=str(doc.model_id),
                title=doc.title,
                doc_type=doc.doc_type,
                content=doc.content,
                category=doc.category,
                order_index=doc.order_index,
                created_at=doc.created_at,
                updated_at=doc.updated_at
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update training documentation: {e}")
            raise

    async def delete_training_documentation(self, db: AsyncSession, doc_id: str) -> bool:
        """Delete training documentation"""
        try:
            stmt = delete(ModelTrainingDocumentation).where(ModelTrainingDocumentation.id == doc_id)
            result = await db.execute(stmt)
            await db.commit()
            
            return result.rowcount > 0
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete training documentation: {e}")
            return False

    async def get_model_training_questions(self, db: AsyncSession, model_id: str) -> List[ModelTrainingQuestionResponse]:
        """Get training questions for a model"""
        try:
            stmt = select(ModelTrainingQuestion).where(
                ModelTrainingQuestion.model_id == model_id
            ).order_by(ModelTrainingQuestion.created_at.desc())
            
            result = await db.execute(stmt)
            questions = result.scalars().all()
            
            return [
                ModelTrainingQuestionResponse(
                    id=q.id,
                    model_id=q.model_id,
                    question=q.question,
                    sql=q.sql,
                    involved_columns=q.involved_columns,
                    query_type=q.query_type,
                    difficulty=q.difficulty,
                    generated_by=q.generated_by,
                    is_validated=q.is_validated,
                    validation_notes=q.validation_notes,
                    created_at=q.created_at,
                    updated_at=q.updated_at
                )
                for q in questions
            ]
        except Exception as e:
            logger.error(f"Failed to get training questions: {e}")
            return []

    async def create_training_question(
        self, 
        db: AsyncSession, 
        model_id: str, 
        question_data: ModelTrainingQuestionCreate
    ) -> ModelTrainingQuestionResponse:
        """Create new training question"""
        try:
            question = ModelTrainingQuestion(
                model_id=model_id,
                question=question_data.question,
                sql=question_data.sql,
                involved_columns=question_data.involved_columns,
                query_type=question_data.query_type,
                difficulty=question_data.difficulty,
                generated_by=question_data.generated_by,
                is_validated=question_data.is_validated,
                validation_notes=question_data.validation_notes
            )
            
            db.add(question)
            await db.commit()
            await db.refresh(question)
            
            return ModelTrainingQuestionResponse(
                id=str(question.id),
                model_id=str(question.model_id),
                question=question.question,
                sql=question.sql,
                involved_columns=question.involved_columns,
                query_type=question.query_type,
                difficulty=question.difficulty,
                generated_by=question.generated_by,
                is_validated=question.is_validated,
                validation_notes=question.validation_notes,
                created_at=question.created_at,
                updated_at=question.updated_at
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create training question: {e}")
            raise

    async def update_training_question(
        self, 
        db: AsyncSession, 
        question_id: str, 
        question_data: ModelTrainingQuestionUpdate
    ) -> Optional[ModelTrainingQuestionResponse]:
        """Update training question"""
        try:
            stmt = select(ModelTrainingQuestion).where(ModelTrainingQuestion.id == question_id)
            result = await db.execute(stmt)
            question = result.scalar_one_or_none()
            
            if not question:
                return None
            
            # Update fields
            if question_data.question is not None:
                question.question = question_data.question
            if question_data.sql is not None:
                question.sql = question_data.sql
            if question_data.involved_columns is not None:
                question.involved_columns = question_data.involved_columns
            if question_data.query_type is not None:
                question.query_type = question_data.query_type
            if question_data.difficulty is not None:
                question.difficulty = question_data.difficulty
            if question_data.generated_by is not None:
                question.generated_by = question_data.generated_by
            if question_data.is_validated is not None:
                question.is_validated = question_data.is_validated
            if question_data.validation_notes is not None:
                question.validation_notes = question_data.validation_notes
            
            await db.commit()
            await db.refresh(question)
            
            return ModelTrainingQuestionResponse(
                id=str(question.id),
                model_id=str(question.model_id),
                question=question.question,
                sql=question.sql,
                involved_columns=question.involved_columns,
                query_type=question.query_type,
                difficulty=question.difficulty,
                generated_by=question.generated_by,
                is_validated=question.is_validated,
                validation_notes=question.validation_notes,
                created_at=question.created_at,
                updated_at=question.updated_at
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update training question: {e}")
            raise

    async def delete_training_question(self, db: AsyncSession, question_id: str) -> bool:
        """Delete training question"""
        try:
            stmt = delete(ModelTrainingQuestion).where(ModelTrainingQuestion.id == question_id)
            result = await db.execute(stmt)
            await db.commit()
            
            return result.rowcount > 0
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete training question: {e}")
            return False

    async def validate_training_question(
        self,
        db: AsyncSession,
        user: User,
        question_id: str
    ) -> Dict[str, Any]:
        """Validate a training question by executing the SQL query"""
        try:
            # Get the question
            stmt = select(ModelTrainingQuestion).where(ModelTrainingQuestion.id == question_id)
            result = await db.execute(stmt)
            question = result.scalar_one_or_none()
            
            if not question:
                return {
                    "success": False,
                    "error_message": "Question not found"
                }
            
            # Get the model to access connection information
            stmt = select(Model).where(Model.id == question.model_id)
            result = await db.execute(stmt)
            model = result.scalar_one_or_none()
            
            if not model:
                return {
                    "success": False,
                    "error_message": "Model not found"
                }
            
            # Verify user owns the model
            if model.user_id != user.id:
                return {
                    "success": False,
                    "error_message": "Access denied"
                }
            
            # Get connection information
            from app.services.connection_service import ConnectionService
            connection_service = ConnectionService()
            connection = await connection_service.get_connection_by_id(db, str(model.connection_id))
            
            if not connection:
                return {
                    "success": False,
                    "error_message": "Database connection not found"
                }
            
            # Execute the SQL query
            try:
                execution_result = await self._execute_sql_query(connection, question.sql)
                
                # Update question as validated
                question.is_validated = True
                question.validation_notes = f"Query executed successfully. Returned {len(execution_result)} rows."
                await db.commit()
                
                return {
                    "success": True,
                    "is_validated": True,
                    "validation_notes": question.validation_notes,
                    "execution_result": execution_result,
                    "message": "Query executed successfully"
                }
                
            except Exception as query_error:
                # Update question as invalid
                question.is_validated = False
                question.validation_notes = f"Query execution failed: {str(query_error)}"
                await db.commit()
                
                return {
                    "success": True,
                    "is_validated": False,
                    "validation_notes": question.validation_notes,
                    "message": "Query execution failed"
                }
            
        except Exception as e:
            logger.error(f"Failed to validate training question: {e}")
            await db.rollback()
            return {
                "success": False,
                "error_message": f"Validation failed: {str(e)}"
            }

    async def _execute_sql_query(self, connection: Any, sql: str) -> List[Dict[str, Any]]:
        """Execute a SQL query and return results"""
        try:
            # Build connection string directly from connection object
            conn_str = f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            conn_str += f"SERVER={connection.server};"
            conn_str += f"DATABASE={connection.database_name};"
            conn_str += f"UID={connection.username};"
            conn_str += f"PWD={connection.password};"
            
            # Add encryption settings
            if connection.encrypt:
                conn_str += "Encrypt=yes;"
            else:
                conn_str += "Encrypt=no;"
            
            if connection.trust_server_certificate:
                conn_str += "TrustServerCertificate=yes;"
            
            # Connect and execute query
            cnxn = await asyncio.to_thread(pyodbc.connect, conn_str, timeout=30)
            cursor = cnxn.cursor()
            
            try:
                # Execute the query
                cursor.execute(sql)
                rows = cursor.fetchall()
                
                # Get column names
                columns = [column[0] for column in cursor.description] if cursor.description else []
                
                # Convert to list of dictionaries
                if rows and columns:
                    return [dict(zip(columns, row)) for row in rows]
                else:
                    return []
            finally:
                cursor.close()
                cnxn.close()
                    
        except Exception as e:
            logger.error(f"SQL execution error: {e}")
            raise e

    async def get_model_training_columns(self, db: AsyncSession, model_id: str) -> List[ModelTrainingColumnResponse]:
        """Get training columns for a model"""
        try:
            stmt = select(ModelTrainingColumn).where(
                ModelTrainingColumn.model_id == model_id,
                ModelTrainingColumn.is_active == True
            ).order_by(ModelTrainingColumn.table_name, ModelTrainingColumn.column_name)
            
            result = await db.execute(stmt)
            columns = result.scalars().all()
            
            return [
                ModelTrainingColumnResponse(
                    id=str(col.id),
                    model_id=str(col.model_id),
                    table_name=col.table_name,
                    column_name=col.column_name,
                    data_type=col.data_type,
                    description=col.description,
                    value_range=col.value_range,
                    description_source=col.description_source,
                    is_active=col.is_active,
                    created_at=col.created_at,
                    updated_at=col.updated_at
                )
                for col in columns
            ]
        except Exception as e:
            logger.error(f"Failed to get training columns: {e}")
            return []

    async def create_training_column(
        self, 
        db: AsyncSession, 
        model_id: str, 
        column_data: ModelTrainingColumnCreate
    ) -> ModelTrainingColumnResponse:
        """Create new training column"""
        try:
            column = ModelTrainingColumn(
                model_id=model_id,
                table_name=column_data.table_name,
                column_name=column_data.column_name,
                data_type=column_data.data_type,
                description=column_data.description,
                value_range=column_data.value_range,
                description_source=column_data.description_source,
                is_active=column_data.is_active
            )
            
            db.add(column)
            await db.commit()
            await db.refresh(column)
            
            return ModelTrainingColumnResponse(
                id=str(column.id),
                model_id=str(column.model_id),
                table_name=column.table_name,
                column_name=column.column_name,
                data_type=column.data_type,
                description=column.description,
                value_range=column.value_range,
                description_source=column.description_source,
                is_active=column.is_active,
                created_at=column.created_at,
                updated_at=column.updated_at
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create training column: {e}")
            raise

    async def update_tracked_column_description(
        self, 
        db: AsyncSession, 
        column_id: str, 
        description: str
    ) -> Optional[Dict[str, Any]]:
        """Update tracked column description"""
        try:
            stmt = select(ModelTrackedColumn).where(ModelTrackedColumn.id == column_id)
            result = await db.execute(stmt)
            column = result.scalar_one_or_none()
            
            if not column:
                return None
            
            # Update description
            column.description = description
            await db.commit()
            await db.refresh(column)
            
            # Get the tracked table info
            stmt = select(ModelTrackedTable).where(ModelTrackedTable.id == column.model_tracked_table_id)
            result = await db.execute(stmt)
            tracked_table = result.scalar_one_or_none()
            
            return {
                "id": str(column.id),
                "table_name": tracked_table.table_name if tracked_table else "Unknown",
                "column_name": column.column_name,
                "data_type": "Unknown",
                "description": column.description,
                "value_range": None,
                "created_at": column.created_at.isoformat() if column.created_at else None
            }
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update tracked column description: {e}")
            return None

    async def update_training_column(
        self, 
        db: AsyncSession, 
        column_id: str, 
        column_data: ModelTrainingColumnUpdate
    ) -> Optional[ModelTrainingColumnResponse]:
        """Update training column"""
        try:
            stmt = select(ModelTrainingColumn).where(ModelTrainingColumn.id == column_id)
            result = await db.execute(stmt)
            column = result.scalar_one_or_none()
            
            if not column:
                return None
            
            # Update fields
            if column_data.table_name is not None:
                column.table_name = column_data.table_name
            if column_data.column_name is not None:
                column.column_name = column_data.column_name
            if column_data.data_type is not None:
                column.data_type = column_data.data_type
            if column_data.description is not None:
                column.description = column_data.description
            if column_data.value_range is not None:
                column.value_range = column_data.value_range
            if column_data.description_source is not None:
                column.description_source = column_data.description_source
            if column_data.is_active is not None:
                column.is_active = column_data.is_active
            
            await db.commit()
            await db.refresh(column)
            
            return ModelTrainingColumnResponse(
                id=str(column.id),
                model_id=str(column.model_id),
                table_name=column.table_name,
                column_name=column.column_name,
                data_type=column.data_type,
                description=column.description,
                value_range=column.value_range,
                description_source=column.description_source,
                is_active=column.is_active,
                created_at=column.created_at,
                updated_at=column.updated_at
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update training column: {e}")
            raise

    async def delete_training_column(self, db: AsyncSession, column_id: str) -> bool:
        """Delete training column"""
        try:
            stmt = delete(ModelTrainingColumn).where(ModelTrainingColumn.id == column_id)
            result = await db.execute(stmt)
            await db.commit()
            
            return result.rowcount > 0
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete training column: {e}")
            return False

    async def get_model_training_data(self, db: AsyncSession, model_id: str) -> Dict[str, Any]:
        """Get all training data for a model"""
        try:
            # Get model info
            stmt = select(Model).where(Model.id == model_id)
            result = await db.execute(stmt)
            model = result.scalar_one_or_none()
            
            if not model:
                return {}
            
            # Get training questions
            questions = await self.get_model_training_questions(db, model_id)
            
            # Get training documentation
            documentation = await self.get_model_training_documentation(db, model_id)
            
            # Get tracked columns (only tracked ones)
            columns = await self._get_all_tracked_columns_for_model(db, model_id)
            
            return {
                "model_id": str(model_id),
                "model_name": model.name,
                "model_status": model.status,
                "questions": [
                    {
                        "id": q.id,
                        "question": q.question,
                        "sql": q.sql,
                        "involved_columns": q.involved_columns,
                        "query_type": q.query_type,
                        "difficulty": q.difficulty,
                        "generated_by": q.generated_by,
                        "is_validated": q.is_validated,
                        "validation_notes": q.validation_notes,
                        "created_at": q.created_at.isoformat() if q.created_at else None
                    } for q in questions
                ],
                "documentation": [
                    {
                        "id": d.id,
                        "title": d.title,
                        "content": d.content,
                        "doc_type": d.doc_type,
                        "category": d.category,
                        "created_at": d.created_at.isoformat() if d.created_at else None
                    } for d in documentation
                ],
                "columns": columns,
                "total_questions": len(questions),
                "total_documentation": len(documentation),
                "total_columns": len(columns)
            }
        except Exception as e:
            logger.error(f"Failed to get model training data: {e}")
            return {}
    
    async def train_model(
        self, 
        db: AsyncSession, 
        model_id: str, 
        user: User, 
        num_examples: int = 50
    ) -> Dict[str, Any]:
        """Coordinate model training process"""
        try:
            # Verify model ownership
            stmt = select(Model).where(
                Model.id == model_id,
                Model.user_id == user.id
            )
            result = await db.execute(stmt)
            model = result.scalar_one_or_none()
            
            if not model:
                raise ValueError("Model not found or access denied")
            
            # Update model status to training
            stmt = update(Model).where(Model.id == model_id).values(
                status=ModelStatus.TRAINING,
                updated_at=datetime.utcnow()
            )
            await db.execute(stmt)
            await db.commit()
            
            # Create a task ID for tracking
            import uuid
            task_id = str(uuid.uuid4())
            
            # Generate training data
            result = await self.generate_training_data(
                db=db,
                user=user,
                model_id=model_id,
                num_examples=num_examples,
                task_id=task_id
            )
            
            if result.success:
                # Update model status to trained
                stmt = update(Model).where(Model.id == model_id).values(
                    status=ModelStatus.TRAINED,
                    updated_at=datetime.utcnow()
                )
                await db.execute(stmt)
                await db.commit()
                
                return {
                    "success": True,
                    "model_id": model_id,
                    "total_generated": result.total_generated,
                    "failed_count": result.failed_count
                }
            else:
                # Update model status back to draft
                stmt = update(Model).where(Model.id == model_id).values(
                    status=ModelStatus.DRAFT,
                    updated_at=datetime.utcnow()
                )
                await db.execute(stmt)
                await db.commit()
                
                return {
                    "success": False,
                    "error": result.error_message
                }
            
        except Exception as e:
            # Update model status back to draft on error
            try:
                stmt = update(Model).where(Model.id == model_id).values(
                    status=ModelStatus.DRAFT,
                    updated_at=datetime.utcnow()
                )
                await db.execute(stmt)
                await db.commit()
            except:
                pass
            
            logger.error(f"Model training failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def query_model(
        self, 
        db: AsyncSession, 
        model_id: str, 
        user: User, 
        question: str
    ) -> Dict[str, Any]:
        """Query a trained model"""
        try:
            # Verify model ownership
            stmt = select(Model).where(
                Model.id == model_id,
                Model.user_id == user.id
            )
            result = await db.execute(stmt)
            model = result.scalar_one_or_none()
            
            if not model:
                return {"success": False, "error": "Model not found or access denied"}
            
            # Check if model is trained
            if model.status != ModelStatus.TRAINED:
                return {"success": False, "error": "Model is not trained"}
            
            # Query the model using vanna service
            result = await vanna_service.query_model(
                model_id=model_id,
                question=question,
                user=user
            )
            
            if result:
                return {
                    "success": True,
                    "sql": result,
                    "model_id": model_id
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to generate SQL"
                }
            
        except Exception as e:
            logger.error(f"Model query failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def generate_enhanced_training_questions(
        self,
        db: AsyncSession,
        user: User,
        model_id: str,
        scope_config: Dict[str, Any],
        task_id: str
    ) -> Dict[str, Any]:
        """Generate enhanced training questions with precise column associations"""
        sse_logger = SSELogger(sse_manager, task_id, "enhanced_question_generation")
        
        try:
            await sse_logger.info(f"Starting enhanced question generation for model {model_id}")
            await sse_logger.progress(10, "Preparing generation scope...")
            
            # Get model and verify ownership
            model = await self._get_model_and_verify_ownership(db, model_id, user)
            if not model:
                raise ValueError(f"Model {model_id} not found or access denied for user {user.email}")
            
            # Prepare generation scope
            scope = await self._prepare_generation_scope(db, model_id, scope_config)
            
            await sse_logger.progress(20, f"Scope prepared: {scope['type']}")
            
            # Load and process prompt template
            additional_instructions = scope_config.get('additional_instructions', '')
            prompt = self._load_and_process_prompt(scope['type'], scope, additional_instructions)
            
            await sse_logger.progress(30, "Generating questions with LLM...")
            
            # Generate structured questions
            llm_response = await self._generate_structured_questions(prompt)
            
            await sse_logger.progress(60, "Validating and processing questions...")
            
            # Validate and associate questions
            validated_questions = self._validate_and_associate_questions(llm_response, scope)
            
            await sse_logger.progress(80, f"Validated {len(validated_questions)} questions")
            
            # Save to database
            saved_count = await self._save_structured_questions(db, model_id, validated_questions)
            
            await sse_logger.progress(100, f"Successfully saved {saved_count} questions")
            
            return {
                "success": True,
                "generated_count": saved_count,
                "scope": scope['type'],
                "message": f"Generated {saved_count} questions for {scope['type']}"
            }
            
        except Exception as e:
            error_msg = f"Enhanced question generation failed: {str(e)}"
            await sse_logger.error(error_msg)
            logger.error(error_msg)
            
            return {
                "success": False,
                "generated_count": 0,
                "error_message": error_msg
            }

    async def _prepare_generation_scope(
        self,
        db: AsyncSession,
        model_id: str,
        scope_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Prepare generation scope with schema information"""
        
        scope_type = scope_config.get('type', 'single_table')
        tables = scope_config.get('tables', [])
        columns = scope_config.get('columns', {})
        num_questions = scope_config.get('num_questions', 20)
        
        # Get tracked tables and columns
        tracked_data = await self._get_tracked_tables_and_columns(db, model_id, tables)
        
        # Build schema information
        schema_info = self._build_schema_info_for_scope(tracked_data, columns)
        
        return {
            'type': scope_type,
            'tables': tables,
            'columns': columns,
            'schema_info': schema_info,
            'num_questions': num_questions,
            'tracked_data': tracked_data
        }

    async def _get_tracked_tables_and_columns(
        self,
        db: AsyncSession,
        model_id: str,
        tables: List[str]
    ) -> Dict[str, Any]:
        """Get tracked tables and their columns for the model"""
        
        # Get tracked tables
        query = select(ModelTrackedTable).where(
            and_(
                ModelTrackedTable.model_id == model_id,
                ModelTrackedTable.is_active == True
            )
        )
        
        if tables:
            query = query.where(ModelTrackedTable.table_name.in_(tables))
        
        result = await db.execute(query)
        tracked_tables = result.scalars().all()
        
        # Get columns for each table
        table_data = {}
        for table in tracked_tables:
            columns_query = select(ModelTrackedColumn).where(
                and_(
                    ModelTrackedColumn.model_tracked_table_id == table.id,
                    ModelTrackedColumn.is_tracked == True
                )
            )
            columns_result = await db.execute(columns_query)
            columns = columns_result.scalars().all()
            
            table_data[table.table_name] = {
                'table': table,
                'columns': columns
            }
        
        return table_data

    def _build_schema_info_for_scope(
        self,
        tracked_data: Dict[str, Any],
        columns: Dict[str, List[str]]
    ) -> str:
        """Build detailed schema information for prompt"""
        
        schema_lines = []
        
        for table_name, table_info in tracked_data.items():
            table = table_info['table']
            all_columns = table_info['columns']
            
            # Filter columns if specific columns are requested
            if table_name in columns:
                selected_columns = [col for col in all_columns if col.column_name in columns[table_name]]
            else:
                selected_columns = all_columns
            
            schema_lines.append(f"\nTable: {table_name}")
            if table.schema_name:
                schema_lines.append(f"Schema: {table.schema_name}")
            
            for col in selected_columns:
                # Build value information string
                value_info = self._get_column_value_info_for_schema(col)
                
                schema_lines.append(
                    f"- {col.column_name}"
                    f" - Description: {col.description or 'No description'}"
                    f"{value_info}"
                )
        
        return "\n".join(schema_lines)
    
    def _get_column_value_info_for_schema(self, column) -> str:
        """Get value information for schema display"""
        value_info_parts = []
        
        if column.value_categories and len(column.value_categories) > 0:
            distinct_count = column.value_distinct_count or len(column.value_categories)
            data_type = column.value_data_type or 'categorical'
            
            if data_type == 'high_cardinality':
                sample_size = column.value_sample_size or 20
                display_categories = column.value_categories[:3]
                remaining = distinct_count - sample_size
                value_info_parts.append(f" - Categories (sample): {', '.join(display_categories)} ... and {remaining} more ({distinct_count} total)")
            else:
                display_categories = column.value_categories[:4]
                remaining = distinct_count - len(display_categories)
                if remaining > 0:
                    value_info_parts.append(f" - Categories: {', '.join(display_categories)} +{remaining} more ({distinct_count} total)")
                else:
                    value_info_parts.append(f" - Categories: {', '.join(display_categories)} ({distinct_count} total)")
        
        if column.value_range_min or column.value_range_max:
            distinct_count = column.value_distinct_count or 0
            if column.value_range_min and column.value_range_max:
                value_info_parts.append(f" - Range: {column.value_range_min} to {column.value_range_max} ({distinct_count} distinct)")
            elif column.value_range_min:
                value_info_parts.append(f" - Min: {column.value_range_min} ({distinct_count} distinct)")
            elif column.value_range_max:
                value_info_parts.append(f" - Max: {column.value_range_max} ({distinct_count} distinct)")
        
        if column.value_distinct_count and column.value_distinct_count > 0 and not value_info_parts:
            value_info_parts.append(f" - Distinct values: {column.value_distinct_count}")
        
        if value_info_parts:
            return "".join(value_info_parts)
        return ""

    def _load_and_process_prompt(
        self,
        template_name: str,
        scope_config: Dict[str, Any],
        additional_instructions: str = ''
    ) -> str:
        """Load prompt template and replace placeholders"""
        
        # Load template file
        template_path = f"app/prompts/training/{template_name}.txt"
        try:
            with open(template_path, 'r') as f:
                template = f.read()
        except FileNotFoundError:
            # Fallback to single_table template
            with open("app/prompts/training/single_table.txt", 'r') as f:
                template = f.read()
        
        # Format columns list
        columns_list = self._format_columns_list(scope_config['columns'])
        
        # Replace placeholders
        additional_instructions_placeholder = f"\nAdditional Instructions:\n{additional_instructions}" if additional_instructions else ""
        
        prompt = template.format(
            num_questions=scope_config['num_questions'],
            table_name=scope_config['tables'][0] if len(scope_config['tables']) == 1 else "multiple tables",
            table_names=", ".join(scope_config['tables']),
            table_schema=scope_config['schema_info'],
            columns_list=columns_list,
            additional_instructions_placeholder=additional_instructions_placeholder
        )
        
        # Debug: Log the final prompt
        logger.info(f"=== FINAL PROMPT SENT TO AI ===")
        logger.info(f"Additional Instructions: '{additional_instructions}'")
        logger.info(f"Additional Instructions Placeholder: '{additional_instructions_placeholder}'")
        logger.info(f"Full Prompt Length: {len(prompt)} characters")
        logger.info(f"Prompt Preview (first 500 chars): {prompt[:500]}...")
        logger.info(f"Prompt Preview (last 500 chars): {prompt[-500:]}...")
        logger.info(f"=== END PROMPT DEBUG ===")
        
        return prompt


    def _format_columns_list(self, columns: Dict[str, List[str]]) -> str:
        """Format columns list for prompt"""
        if not columns:
            return "All available columns"
        
        lines = []
        for table, cols in columns.items():
            lines.append(f"{table}: {', '.join(cols)}")
        
        return "\n".join(lines)

    async def _generate_structured_questions(self, prompt: str) -> Dict[str, Any]:
        """Generate questions with structured JSON response"""
        
        client = self._get_openai_client()
        
        # Load system prompt
        system_prompt = self._load_system_prompt()
        
        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=4000
        )
        
        content = response.choices[0].message.content
        
        # Debug: Log the raw response
        logger.info(f"Raw LLM response: {content}")
        
        try:
            parsed_response = json.loads(content)
            logger.info(f"Parsed response keys: {list(parsed_response.keys())}")
            if 'questions' in parsed_response:
                logger.info(f"Number of questions: {len(parsed_response['questions'])}")
                for i, q in enumerate(parsed_response['questions']):
                    logger.info(f"Question {i+1} keys: {list(q.keys())}")
            return parsed_response
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}")
            logger.error(f"Raw content: {content}")
            raise

    def _load_system_prompt(self) -> str:
        """Load the base system prompt"""
        try:
            with open("app/prompts/training/base_system.txt", 'r') as f:
                return f.read()
        except FileNotFoundError:
            return "You are an expert SQL query generator specializing in Microsoft SQL Server syntax."

    def _validate_and_associate_questions(
        self,
        llm_response: Dict[str, Any],
        scope_config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Validate and parse structured question response"""
        
        validated_questions = []
        
        if 'questions' not in llm_response:
            logger.error("Invalid LLM response format: missing 'questions' key")
            return validated_questions
        
        for question_data in llm_response["questions"]:
            try:
                # Validate required fields
                if not self._validate_required_fields(question_data):
                    continue
                    
                # Validate column associations
                if not self._validate_column_associations(question_data["involved_columns"], scope_config):
                    continue
                    
                # Validate SQL syntax (basic check)
                if not self._validate_sql_syntax(question_data["sql"]):
                    continue
                    
                validated_questions.append(question_data)
                
            except Exception as e:
                logger.warning(f"Failed to validate question: {e}")
                continue
        
        return validated_questions

    def _validate_required_fields(self, question_data: Dict[str, Any]) -> bool:
        """Validate that all required fields are present"""
        required_fields = ["question", "sql", "involved_columns", "query_type", "difficulty"]
        
        for field in required_fields:
            if field not in question_data or not question_data[field]:
                logger.warning(f"Missing required field: {field}")
                return False
        
        # Normalize query_type to standard values
        query_type = question_data.get("query_type", "").lower()
        if "select" in query_type and "join" not in query_type:
            question_data["query_type"] = "simple_select"
        elif "join" in query_type:
            question_data["query_type"] = "join"
        elif "aggregat" in query_type or "group" in query_type or "sum" in query_type or "count" in query_type or "avg" in query_type:
            question_data["query_type"] = "aggregation"
        elif "subquery" in query_type or "in (" in question_data.get("sql", "").lower():
            question_data["query_type"] = "subquery"
        elif "window" in query_type or "over (" in question_data.get("sql", "").lower():
            question_data["query_type"] = "window_function"
        elif "cte" in query_type or "with " in question_data.get("sql", "").lower():
            question_data["query_type"] = "cte"
        else:
            question_data["query_type"] = "simple_select"
        
        return True

    def _validate_column_associations(
        self,
        involved_columns: List[Dict[str, str]],
        scope_config: Dict[str, Any]
    ) -> bool:
        """Validate that involved columns are within the scope"""
        
        if not involved_columns:
            return False
        
        scope_columns = scope_config.get('columns', {})
        tracked_data = scope_config.get('tracked_data', {})
        
        for col_assoc in involved_columns:
            table = col_assoc.get('table')
            column = col_assoc.get('column')
            
            if not table or not column:
                return False
            
            # Check if table is in scope
            if table not in tracked_data:
                return False
            
            # Check if column is allowed (if specific columns are specified)
            if scope_columns and table in scope_columns:
                if column not in scope_columns[table]:
                    return False
        
        return True

    def _validate_sql_syntax(self, sql: str) -> bool:
        """Basic SQL syntax validation"""
        if not sql or not sql.strip():
            return False
        
        # Basic checks
        sql_upper = sql.upper()
        
        # Must start with SELECT
        if not sql_upper.strip().startswith('SELECT'):
            return False
        
        # Must contain FROM
        if 'FROM' not in sql_upper:
            return False
        
        return True

    async def _save_structured_questions(
        self,
        db: AsyncSession,
        model_id: str,
        questions: List[Dict[str, Any]]
    ) -> int:
        """Save structured questions with column associations"""
        
        saved_count = 0
        
        for question_data in questions:
            try:
                training_question = ModelTrainingQuestion(
                    model_id=model_id,
                    question=question_data["question"],
                    sql=question_data["sql"],
                    involved_columns=question_data["involved_columns"],
                    query_type=question_data.get("query_type", "unknown"),
                    difficulty=question_data.get("difficulty", "medium"),
                    generated_by="ai",
                    is_validated=False
                )
                
                db.add(training_question)
                saved_count += 1
                
            except Exception as e:
                logger.error(f"Failed to save question: {e}")
                continue
        
        await db.commit()
        return saved_count

# Global instance
training_service = TrainingService()