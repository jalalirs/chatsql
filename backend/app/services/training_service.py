import os
import json
import uuid
import asyncio
import pyodbc
from typing import Optional, List, Dict, Any, Callable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
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
    ModelStatus
)
from app.models.vanna_models import (
    DataGenerationConfig, TrainingConfig, GeneratedDataResult, 
    TrainingResult, VannaTrainingData, TrainingDocumentation as VannaTrainingDoc, 
    TrainingExample as VannaTrainingExample, MSSQLConstants
)
from app.services.connection_service import connection_service
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
                model_id=model_id
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
                error_message=error_msg,
                model_id=model_id
            )
    
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
            cnxn = pyodbc.connect(conn_str, timeout=30)
            cursor = cnxn.cursor()
            
            # Get table schema
            full_table_name = f"{table_info.schema_name}.{table_info.table_name}"
            await sse_logger.info(f"Analyzing schema for table: {full_table_name}")
            
            # Get columns for this table
            cursor.execute(f"""
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = '{table_info.schema_name}' AND TABLE_NAME = '{table_info.table_name}'
                ORDER BY ORDINAL_POSITION
            """)
            
            columns = cursor.fetchall()
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
                    id=str(q.id),
                    model_id=str(q.model_id),
                    question=q.question,
                    sql=q.sql,
                    table_name=q.table_name,
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
                table_name=question_data.table_name,
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
                table_name=question.table_name,
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
            if question_data.table_name is not None:
                question.table_name = question_data.table_name
            if question_data.validation_notes is not None:
                question.validation_notes = question_data.validation_notes
            
            await db.commit()
            await db.refresh(question)
            
            return ModelTrainingQuestionResponse(
                id=str(question.id),
                model_id=str(question.model_id),
                question=question.question,
                sql=question.sql,
                table_name=question.table_name,
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
            
            # Get training columns
            columns = await self.get_model_training_columns(db, model_id)
            
            return {
                "model_id": str(model_id),
                "model_name": model.name,
                "model_status": model.status,
                "questions": [
                    {
                        "id": q.id,
                        "question": q.question,
                        "sql": q.sql,
                        "table_name": q.table_name,
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
                "columns": [
                    {
                        "id": c.id,
                        "table_name": c.table_name,
                        "column_name": c.column_name,
                        "data_type": c.data_type,
                        "description": c.description,
                        "value_range": c.value_range,
                        "created_at": c.created_at.isoformat() if c.created_at else None
                    } for c in columns
                ],
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

# Global instance
training_service = TrainingService()