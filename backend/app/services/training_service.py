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
    Connection, TrainingExample, TrainingTask, ConnectionStatus, User,
    TrainingDocumentation, TrainingQuestionSql, TrainingColumnSchema
)
from app.models.schemas import (
    GenerateExamplesRequest, TrainingExampleResponse,
    TrainingDocumentationCreate, TrainingDocumentationUpdate, TrainingDocumentationResponse,
    TrainingQuestionSqlCreate, TrainingQuestionSqlUpdate, TrainingQuestionSqlResponse,
    TrainingColumnSchemaCreate, TrainingColumnSchemaUpdate, TrainingColumnSchemaResponse,
    GenerateColumnDescriptionsRequest
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
        connection_id: str, 
        num_examples: int,
        task_id: str
    ) -> GeneratedDataResult:
        """Generate training data for a user's connection"""
        sse_logger = SSELogger(sse_manager, task_id, "data_generation")
        
        try:
            await sse_logger.info(f"Starting data generation for user {user.email}, connection {connection_id}")
            await sse_logger.progress(5, "Verifying connection ownership...")
            
            # Get connection from database (this verifies user ownership)
            connection_response = await connection_service.get_user_connection(db, str(user.id), connection_id)
            if not connection_response:
                raise ValueError(f"Connection {connection_id} not found or access denied for user {user.email}")
            
            # Get raw connection object for internal operations
            connection = await connection_service.get_connection_by_id(db, connection_id)
            if not connection:
                raise ValueError(f"Connection {connection_id} not found")
            
            # Double-check user ownership
            if str(connection.user_id) != str(user.id):
                raise ValueError(f"Access denied: Connection does not belong to user {user.email}")
            
            # Update connection status
            await self._update_connection_status(db, connection_id, ConnectionStatus.GENERATING_DATA)
            
            await sse_logger.progress(10, "Analyzing database schema...")
            
            # Analyze schema using connection data from database
            column_info = await self._analyze_database_schema(connection, sse_logger, user)
            
            await sse_logger.progress(20, f"Generating {num_examples} training examples...")
            
            # Generate examples using LLM
            generated_examples = await self._generate_examples_with_llm(
                connection, column_info, num_examples, sse_logger, task_id, user
            )
            
            await sse_logger.progress(80, "Saving generated examples...")
            
            # Convert to database format and save using new method
            question_creates = [
                TrainingQuestionSqlCreate(
                    question=example.question,
                    sql=example.sql,
                    generated_by="ai",
                    generation_model=settings.OPENAI_MODEL
                )
                for example in generated_examples
            ]
            
            await self.bulk_create_questions(db, connection_id, question_creates)
            
            
            await sse_logger.progress(95, "Updating connection status...")
            
            # Update connection status to DATA_GENERATED
            await self._update_connection_status(db, connection_id, ConnectionStatus.DATA_GENERATED)
            
            await sse_logger.progress(100, f"Generated {len(generated_examples)} examples successfully")
            await sse_logger.info(f"Data generation completed for user {user.email}")
            
            return GeneratedDataResult(
                success=True,
                total_generated=len(generated_examples),
                failed_count=num_examples - len(generated_examples),
                examples=generated_examples,
                documentation=[],  # Documentation is now in database
                generation_time=0.0
            )
            
        except Exception as e:
            error_msg = f"Data generation failed for user {user.email}, connection {connection_id}: {str(e)}"
            logger.error(error_msg, exc_info=True)
            
            # Update connection status back to test success
            try:
                await self._update_connection_status(db, connection_id, ConnectionStatus.TEST_SUCCESS)
            except Exception as status_update_err:
                logger.error(f"Failed to update connection status after error: {status_update_err}")

            # Rollback any pending transactions
            try:
                await db.rollback()
            except Exception as rollback_err:
                logger.error(f"Failed to rollback DB session: {rollback_err}")

            return GeneratedDataResult(
                success=False,
                total_generated=0,
                failed_count=num_examples,
                examples=[],
                documentation=[],
                generation_time=0.0,
                error_message=error_msg
            )
    
    async def _analyze_database_schema(
        self, 
        connection: Connection,
        sse_logger: SSELogger,
        user: User
    ) -> Dict[str, Any]:
        """Analyze database schema using connection from database"""
        await sse_logger.info(f"Connecting to database for schema analysis (user: {user.email})...")
        
        # Build connection string from database connection object
        conn_str = self._build_odbc_connection_string(connection)
        
        try:
            cnxn = pyodbc.connect(conn_str)
            cursor = cnxn.cursor()
            
            # Parse table name
            full_table_name = connection.table_name
            if '.' in full_table_name:
                table_schema, table_name_only = full_table_name.split('.', 1)
            else:
                table_schema = 'dbo'
                table_name_only = full_table_name
            
            await sse_logger.info(f"Analyzing schema for table: {full_table_name} (user: {user.email})")
            
            columns_info = {}
            
            # Get column information
            cursor.execute(f"""
                SELECT COLUMN_NAME, DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = '{table_schema}' AND TABLE_NAME = '{table_name_only}';
            """)
            schema_cols = cursor.fetchall()
            
            total_cols = len(schema_cols)
            await sse_logger.info(f"Found {total_cols} columns to analyze")
            
            for idx, (col_name, data_type) in enumerate(schema_cols):
                progress = 20 + int((idx / total_cols) * 50)  # 20-70%
                await sse_logger.progress(progress, f"Analyzing column: {col_name}")
                
                col_info = {'data_type': data_type}
                
                # Categorical Data
                if data_type in ['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext']:
                    try:
                        cursor.execute(f"""
                            SELECT COUNT(DISTINCT [{col_name}]), AVG(CAST(LEN([{col_name}]) AS DECIMAL(10,2))) 
                            FROM {full_table_name} WHERE [{col_name}] IS NOT NULL;
                        """)
                        distinct_count, avg_len_data = cursor.fetchone()
                        
                        if distinct_count and distinct_count < 50 and (avg_len_data is None or avg_len_data < 50):
                            cursor.execute(f"""
                                SELECT DISTINCT TOP 50 [{col_name}] 
                                FROM {full_table_name} WHERE [{col_name}] IS NOT NULL;
                            """)
                            col_info['categories'] = [str(row[0]) for row in cursor.fetchall()]
                    except Exception as e:
                        await sse_logger.warning(f"Could not profile categorical data for {col_name}: {e}")
                
                # Numerical Data
                elif data_type in ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real']:
                    try:
                        cursor.execute(f"""
                            SELECT MIN(CAST([{col_name}] AS FLOAT)), MAX(CAST([{col_name}] AS FLOAT)), AVG(CAST([{col_name}] AS FLOAT)) 
                            FROM {full_table_name} WHERE [{col_name}] IS NOT NULL;
                        """)
                        min_val, max_val, avg_val = cursor.fetchone()
                        if min_val is not None and max_val is not None:
                            col_info['range'] = {'min': min_val, 'max': max_val, 'avg': avg_val}
                    except Exception as e:
                        await sse_logger.warning(f"Could not profile numerical data for {col_name}: {e}")
                
                # Date/Time Data
                elif data_type in ['date', 'datetime', 'datetime2', 'smalldatetime', 'timestamp']:
                    try:
                        cursor.execute(f"""
                            SELECT MIN([{col_name}]), MAX([{col_name}]) 
                            FROM {full_table_name} WHERE [{col_name}] IS NOT NULL;
                        """)
                        min_date, max_date = cursor.fetchone()
                        if min_date and max_date:
                            col_info['date_range'] = {'min': str(min_date), 'max': str(max_date)}
                    except Exception as e:
                        await sse_logger.warning(f"Could not profile date data for {col_name}: {e}")
                
                columns_info[col_name] = col_info
            
            cnxn.close()
            await sse_logger.info(f"Schema analysis complete for {len(columns_info)} columns (user: {user.email})")
            return columns_info
            
        except Exception as e:
            await sse_logger.error(f"Schema analysis failed for user {user.email}: {str(e)}")
            raise
    
    async def _generate_examples_with_llm(
        self, 
        connection: Connection,
        column_info: Dict[str, Any], 
        num_examples: int,
        sse_logger: SSELogger,
        task_id: str,
        user: User
    ) -> List[VannaTrainingExample]:
        """Generate training examples using LLM"""
        
        client = self._get_openai_client()
        table_name = connection.table_name
        connection_id = str(connection.id)
        
        # Create column details for prompt
        column_details = []
        for col_name, info in column_info.items():
            detail = f"Column '{col_name}' ({info['data_type']})"
            
            if 'categories' in info:
                categories = ', '.join(str(val) for val in info['categories'][:10])
                detail += f": Categories - {categories}"
                if len(info['categories']) > 10:
                    detail += "..."
            elif 'range' in info:
                range_info = info['range']
                detail += f": Range {range_info['min']:.2f} - {range_info['max']:.2f} (Avg: {range_info['avg']:.2f})"
            elif 'date_range' in info:
                date_range = info['date_range']
                detail += f": Date range {date_range['min']} to {date_range['max']}"
            
            column_details.append(detail)
        
        column_details_string = "\n".join(column_details)
        
        # Create system prompt
        system_prompt = f"""
You are an expert SQL query generator for Microsoft SQL Server.
Your task is to generate a natural language question and its corresponding SQL query for the table: {table_name}.

---
Table Schema:
{json.dumps({k: v['data_type'] for k, v in column_info.items()}, indent=2)}
---

---
MS SQL Server Conventions:
{MSSQLConstants.MSSQL_CONVENTIONS_DOC}
---

---
Column Details:
{column_details_string}
---

Generate exactly one JSON object with two keys: "question" (natural language) and "sql" (MS SQL query).
The SQL query MUST be valid for MS SQL Server syntax, adhering strictly to the conventions.
The natural language question must be diverse, complex, and sound like a human asking.
Vary the type of queries: simple selections, aggregations, filtering, ordering, grouping, calculations.
Ensure the SQL is realistic given the data types and potential values.
Always output only the JSON object and nothing else.
"""
        
        generated_examples = []
        failed_count = 0
        
        await sse_logger.info(f"Starting LLM generation for {num_examples} examples (user: {user.email})")
        
        for i in range(num_examples):
            progress = 20 + int((i / num_examples) * 60)  # 20-80%
            await sse_logger.progress(progress, f"Generating example {i+1}/{num_examples}")
            
            try:
                response = client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Generate a new, unique question and SQL query. Make it distinct from previous examples. Focus on analytical queries if possible."}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.7
                )
                
                content = response.choices[0].message.content
                content = content.replace("```json\n", "").replace("\n```", "")
                example_data = json.loads(content)
                
                if "question" in example_data and "sql" in example_data:
                    example = VannaTrainingExample(
                        question=example_data["question"],
                        sql=example_data["sql"]
                    )
                    generated_examples.append(example)
                    
                    # Send real-time update with the new example
                    await sse_manager.send_to_task(task_id, "example_generated", {
                        "example_number": i + 1,
                        "total_examples": num_examples,
                        "question": example.question,
                        "sql": example.sql,
                        "connection_id": connection_id,
                        "user_id": str(user.id),
                        "user_email": user.email,
                        "task_id": task_id
                    })
                    
                    await sse_logger.info(f"Generated: {example.question[:50]}...")
                else:
                    failed_count += 1
                    await sse_logger.warning(f"LLM response missing required keys in example {i+1}")
                
            except json.JSONDecodeError as e:
                failed_count += 1
                await sse_logger.warning(f"Failed to decode JSON for example {i+1}: {e}")
            except Exception as e:
                failed_count += 1
                await sse_logger.warning(f"Error generating example {i+1}: {e}")
            
            # Small delay to prevent rate limiting
            await asyncio.sleep(0.1)
        
        await sse_logger.info(f"Generation complete for user {user.email}: {len(generated_examples)} successful, {failed_count} failed")
        return generated_examples
    
    async def _create_training_documentation_db(
        self, 
        db: AsyncSession,
        connection: Connection,
        column_info: Dict[str, Any],
        connection_id: str,
        user: User
    ) -> List[TrainingDocumentationResponse]:
        """Create training documentation entries using database"""
        documentation_creates = []
        
        logger.info(f"Creating training documentation for user {user.email}, connection {connection_id}")
        
        # MS SQL Server conventions - DEFAULT DOCUMENTATION 1
        documentation_creates.append(TrainingDocumentationCreate(
            title="MS SQL Server Conventions",
            doc_type="mssql_conventions",
            content="When generating SQL queries for Microsoft SQL Server, always adhere to the following specific syntax and conventions. Unlike other SQL dialects, MS SQL Server uses square brackets [] to delimit identifiers (like table or column names), especially if they are SQL keywords (e.g., [View]) or contain spaces. For limiting the number of rows returned, always use the TOP N clause immediately after the SELECT keyword, ensuring there is a space between TOP and the numerical value (e.g., SELECT TOP 5 Company_Name). The LIMIT and OFFSET keywords, commonly found in MySQL or PostgreSQL, are not standard. For string concatenation, use the + operator. Date and time manipulation often relies on functions like GETDATE(), DATEADD(), DATEDIFF(), and CONVERT(). Handle NULL values using IS NULL, IS NOT NULL, or functions like ISNULL(expression, replacement) and COALESCE(expression1, expression2, ...). While often case-insensitive by default depending on collation, it's best practice to match casing with database objects. Complex queries frequently leverage Common Table Expressions (CTEs) defined with WITH for readability and structuring multi-step logic. Pay close attention to correct spacing and keyword usage to avoid syntax errors.",
            category="system",
            order_index=1
        ))
        
        # Table info - DEFAULT DOCUMENTATION 2
        documentation_creates.append(TrainingDocumentationCreate(
            title="Table Information",
            doc_type="table_info",
            content=f"I only have one table which is {connection.table_name}",
            category="system",
            order_index=2
        ))
        
        # Save all documentation to database
        return await self.bulk_create_documentation(db, connection_id, documentation_creates)

    async def _update_connection_status(self, db: AsyncSession, connection_id: str, status: ConnectionStatus):
        """Update connection status"""
        stmt = (
            update(Connection)
            .where(Connection.id == uuid.UUID(connection_id))
            .values(status=status, updated_at=datetime.utcnow())
        )
        await db.execute(stmt)
        await db.commit()
    
    # ========================
    # TRAINING DOCUMENTATION METHODS
    # ========================
    
    async def get_training_documentation(
        self, 
        db: AsyncSession, 
        connection_id: str
    ) -> List[TrainingDocumentationResponse]:
        """Get all training documentation for a connection"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            stmt = select(TrainingDocumentation).where(
                TrainingDocumentation.connection_id == connection_uuid,
                TrainingDocumentation.is_active == True
            ).order_by(TrainingDocumentation.category, TrainingDocumentation.order_index)
            
            result = await db.execute(stmt)
            docs = result.scalars().all()
            
            return [
                TrainingDocumentationResponse(
                    id=str(doc.id),
                    connection_id=str(doc.connection_id),
                    title=doc.title,
                    doc_type=doc.doc_type,
                    content=doc.content,
                    category=doc.category,
                    order_index=doc.order_index,
                    is_active=doc.is_active,
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
        connection_id: str, 
        doc_data: TrainingDocumentationCreate
    ) -> TrainingDocumentationResponse:
        """Create new training documentation"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            
            doc = TrainingDocumentation(
                connection_id=connection_uuid,
                title=doc_data.title,
                doc_type=doc_data.doc_type,
                content=doc_data.content,
                category=doc_data.category,
                order_index=doc_data.order_index
            )
            
            db.add(doc)
            await db.commit()
            await db.refresh(doc)
            
            return TrainingDocumentationResponse(
                id=str(doc.id),
                connection_id=str(doc.connection_id),
                title=doc.title,
                doc_type=doc.doc_type,
                content=doc.content,
                category=doc.category,
                order_index=doc.order_index,
                is_active=doc.is_active,
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
        connection_id: str, 
        doc_id: str, 
        doc_data: TrainingDocumentationUpdate
    ) -> Optional[TrainingDocumentationResponse]:
        """Update training documentation"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            doc_uuid = uuid.UUID(doc_id)
            
            stmt = select(TrainingDocumentation).where(
                TrainingDocumentation.id == doc_uuid,
                TrainingDocumentation.connection_id == connection_uuid
            )
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
            if doc_data.is_active is not None:
                doc.is_active = doc_data.is_active
            
            await db.commit()
            await db.refresh(doc)
            
            return TrainingDocumentationResponse(
                id=str(doc.id),
                connection_id=str(doc.connection_id),
                title=doc.title,
                doc_type=doc.doc_type,
                content=doc.content,
                category=doc.category,
                order_index=doc.order_index,
                is_active=doc.is_active,
                created_at=doc.created_at,
                updated_at=doc.updated_at
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update training documentation: {e}")
            raise

    async def delete_training_documentation(
        self, 
        db: AsyncSession, 
        connection_id: str, 
        doc_id: str
    ) -> bool:
        """Delete training documentation"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            doc_uuid = uuid.UUID(doc_id)
            
            stmt = delete(TrainingDocumentation).where(
                TrainingDocumentation.id == doc_uuid,
                TrainingDocumentation.connection_id == connection_uuid
            )
            
            result = await db.execute(stmt)
            await db.commit()
            
            return result.rowcount > 0
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete training documentation: {e}")
            return False

    # ========================
    # TRAINING QUESTION-SQL METHODS
    # ========================
    
    async def get_training_questions(
        self, 
        db: AsyncSession, 
        connection_id: str
    ) -> List[TrainingQuestionSqlResponse]:
        """Get all training question-SQL pairs for a connection"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            stmt = select(TrainingQuestionSql).where(
                TrainingQuestionSql.connection_id == connection_uuid,
                TrainingQuestionSql.is_active == True
            ).order_by(TrainingQuestionSql.created_at.desc())
            
            result = await db.execute(stmt)
            questions = result.scalars().all()
            
            return [
                TrainingQuestionSqlResponse(
                    id=str(q.id),
                    connection_id=str(q.connection_id),
                    question=q.question,
                    sql=q.sql,
                    generated_by=q.generated_by,
                    generation_model=q.generation_model,
                    is_validated=q.is_validated,
                    validation_notes=q.validation_notes,
                    is_active=q.is_active,
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
        connection_id: str, 
        question_data: TrainingQuestionSqlCreate
    ) -> TrainingQuestionSqlResponse:
        """Create new training question-SQL pair"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            
            question = TrainingQuestionSql(
                connection_id=connection_uuid,
                question=question_data.question,
                sql=question_data.sql,
                generated_by=question_data.generated_by,
                generation_model=question_data.generation_model,
                is_validated=question_data.is_validated,
                validation_notes=question_data.validation_notes
            )
            
            db.add(question)
            await db.commit()
            await db.refresh(question)
            
            return TrainingQuestionSqlResponse(
                id=str(question.id),
                connection_id=str(question.connection_id),
                question=question.question,
                sql=question.sql,
                generated_by=question.generated_by,
                generation_model=question.generation_model,
                is_validated=question.is_validated,
                validation_notes=question.validation_notes,
                is_active=question.is_active,
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
        connection_id: str, 
        question_id: str, 
        question_data: TrainingQuestionSqlUpdate
    ) -> Optional[TrainingQuestionSqlResponse]:
        """Update training question-SQL pair"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            question_uuid = uuid.UUID(question_id)
            
            stmt = select(TrainingQuestionSql).where(
                TrainingQuestionSql.id == question_uuid,
                TrainingQuestionSql.connection_id == connection_uuid
            )
            result = await db.execute(stmt)
            question = result.scalar_one_or_none()
            
            if not question:
                return None
            
            # Update fields
            if question_data.question is not None:
                question.question = question_data.question
            if question_data.sql is not None:
                question.sql = question_data.sql
            if question_data.generated_by is not None:
                question.generated_by = question_data.generated_by
            if question_data.generation_model is not None:
                question.generation_model = question_data.generation_model
            if question_data.is_validated is not None:
                question.is_validated = question_data.is_validated
            if question_data.validation_notes is not None:
                question.validation_notes = question_data.validation_notes
            if question_data.is_active is not None:
                question.is_active = question_data.is_active
            
            await db.commit()
            await db.refresh(question)
            
            return TrainingQuestionSqlResponse(
                id=str(question.id),
                connection_id=str(question.connection_id),
                question=question.question,
                sql=question.sql,
                generated_by=question.generated_by,
                generation_model=question.generation_model,
                is_validated=question.is_validated,
                validation_notes=question.validation_notes,
                is_active=question.is_active,
                created_at=question.created_at,
                updated_at=question.updated_at
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update training question: {e}")
            raise

    async def delete_training_question(
        self, 
        db: AsyncSession, 
        connection_id: str, 
        question_id: str
    ) -> bool:
        """Delete training question-SQL pair"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            question_uuid = uuid.UUID(question_id)
            
            stmt = delete(TrainingQuestionSql).where(
                TrainingQuestionSql.id == question_uuid,
                TrainingQuestionSql.connection_id == connection_uuid
            )
            
            result = await db.execute(stmt)
            await db.commit()
            
            return result.rowcount > 0
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete training question: {e}")
            return False

    # ========================
    # TRAINING COLUMN SCHEMA METHODS
    # ========================
    
    async def get_training_columns(
        self, 
        db: AsyncSession, 
        connection_id: str
    ) -> List[TrainingColumnSchemaResponse]:
        """Get all training column schema for a connection"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            stmt = select(TrainingColumnSchema).where(
                TrainingColumnSchema.connection_id == connection_uuid,
                TrainingColumnSchema.is_active == True
            ).order_by(TrainingColumnSchema.column_name)
            
            result = await db.execute(stmt)
            columns = result.scalars().all()
            
            return [
                TrainingColumnSchemaResponse(
                    id=str(col.id),
                    connection_id=str(col.connection_id),
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
        connection_id: str, 
        column_data: TrainingColumnSchemaCreate
    ) -> TrainingColumnSchemaResponse:
        """Create new training column schema"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            
            column = TrainingColumnSchema(
                connection_id=connection_uuid,
                column_name=column_data.column_name,
                data_type=column_data.data_type,
                description=column_data.description,
                value_range=column_data.value_range,
                description_source=column_data.description_source
            )
            
            db.add(column)
            await db.commit()
            await db.refresh(column)
            
            return TrainingColumnSchemaResponse(
                id=str(column.id),
                connection_id=str(column.connection_id),
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
        connection_id: str, 
        column_id: str, 
        column_data: TrainingColumnSchemaUpdate
    ) -> Optional[TrainingColumnSchemaResponse]:
        """Update training column schema"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            column_uuid = uuid.UUID(column_id)
            
            stmt = select(TrainingColumnSchema).where(
                TrainingColumnSchema.id == column_uuid,
                TrainingColumnSchema.connection_id == connection_uuid
            )
            result = await db.execute(stmt)
            column = result.scalar_one_or_none()
            
            if not column:
                return None
            
            # Update fields
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
            
            return TrainingColumnSchemaResponse(
                id=str(column.id),
                connection_id=str(column.connection_id),
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

    async def delete_training_column(
        self, 
        db: AsyncSession, 
        connection_id: str, 
        column_id: str
    ) -> bool:
        """Delete training column schema"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            column_uuid = uuid.UUID(column_id)
            
            stmt = delete(TrainingColumnSchema).where(
                TrainingColumnSchema.id == column_uuid,
                TrainingColumnSchema.connection_id == connection_uuid
            )
            
            result = await db.execute(stmt)
            await db.commit()
            
            return result.rowcount > 0
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete training column: {e}")
            return False

    # ========================
    # BULK OPERATIONS
    # ========================
    
    async def bulk_create_documentation(
        self, 
        db: AsyncSession, 
        connection_id: str, 
        docs: List[TrainingDocumentationCreate]
    ) -> List[TrainingDocumentationResponse]:
        """Bulk create training documentation"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            results = []
            
            for doc_data in docs:
                doc = TrainingDocumentation(
                    connection_id=connection_uuid,
                    title=doc_data.title,
                    doc_type=doc_data.doc_type,
                    content=doc_data.content,
                    category=doc_data.category,
                    order_index=doc_data.order_index
                )
                db.add(doc)
                results.append(doc)
            
            await db.commit()
            
            return [
                TrainingDocumentationResponse(
                    id=str(doc.id),
                    connection_id=str(doc.connection_id),
                    title=doc.title,
                    doc_type=doc.doc_type,
                    content=doc.content,
                    category=doc.category,
                    order_index=doc.order_index,
                    is_active=doc.is_active,
                    created_at=doc.created_at,
                    updated_at=doc.updated_at
                )
                for doc in results
            ]
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to bulk create documentation: {e}")
            raise

    async def bulk_create_questions(
        self, 
        db: AsyncSession, 
        connection_id: str, 
        questions: List[TrainingQuestionSqlCreate]
    ) -> List[TrainingQuestionSqlResponse]:
        """Bulk create training questions"""
        try:
            connection_uuid = uuid.UUID(connection_id)
            results = []
            
            for question_data in questions:
                question = TrainingQuestionSql(
                    connection_id=connection_uuid,
                    question=question_data.question,
                    sql=question_data.sql,
                    generated_by=question_data.generated_by,
                    generation_model=question_data.generation_model,
                    is_validated=question_data.is_validated,
                    validation_notes=question_data.validation_notes
                )
                db.add(question)
                results.append(question)
            
            await db.commit()
            
            return [
                TrainingQuestionSqlResponse(
                    id=str(q.id),
                    connection_id=str(q.connection_id),
                    question=q.question,
                    sql=q.sql,
                    generated_by=q.generated_by,
                    generation_model=q.generation_model,
                    is_validated=q.is_validated,
                    validation_notes=q.validation_notes,
                    is_active=q.is_active,
                    created_at=q.created_at,
                    updated_at=q.updated_at
                )
                for q in results
            ]
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to bulk create questions: {e}")
            raise

    # ========================
    # AI GENERATION METHODS
    # ========================
    
    async def generate_column_descriptions_with_ai(
        self, 
        db: AsyncSession, 
        connection_id: str, 
        request: GenerateColumnDescriptionsRequest,
        task_id: str,
        user: User
    ) -> Dict[str, Any]:
        """Generate column descriptions using AI"""
        sse_logger = SSELogger(sse_manager, task_id, "column_description_generation")
        
        try:
            await sse_logger.info(f"Starting AI column description generation for user {user.email}")
            await sse_logger.progress(10, "Loading schema information...")
            
            # Get schema information
            schema_data = await connection_service.get_connection_schema(connection_id)
            if not schema_data:
                return {"success": False, "error_message": "No schema data found"}
            
            columns_info = schema_data.get("columns", {})
            if not columns_info:
                return {"success": False, "error_message": "No column information found"}
            
            # Get connection details for context
            connection = await connection_service.get_connection_by_id(db, connection_id)
            if not connection:
                return {"success": False, "error_message": "Connection not found"}
            
            await sse_logger.progress(20, f"Generating descriptions for {len(columns_info)} columns...")
            
            # Get existing descriptions if not overwriting
            existing_descriptions = {}
            if not request.overwrite_existing:
                existing_columns = await self.get_training_columns(db, connection_id)
                existing_descriptions = {
                    col.column_name: col.description 
                    for col in existing_columns 
                    if col.description
                }
            
            # Generate descriptions
            generated_count = 0
            total_columns = len(columns_info)
            client = self._get_openai_client()
            
            for idx, (column_name, column_info) in enumerate(columns_info.items()):
                progress = 20 + int((idx / total_columns) * 60)  # 20-80%
                await sse_logger.progress(progress, f"Processing column: {column_name}")
                
                # Skip if description exists and not overwriting
                if not request.overwrite_existing and column_name in existing_descriptions:
                    await sse_logger.info(f"Skipping {column_name} - description exists")
                    continue
                
                try:
                    # Generate description using AI
                    description = await self._generate_single_column_description(
                        client, connection, column_name, column_info, sse_logger
                    )
                    
                    if description:
                        # Create or update column schema
                        column_data = TrainingColumnSchemaCreate(
                            column_name=column_name,
                            data_type=column_info.get('data_type', ''),
                            description=description,
                            value_range=column_info.get('variable_range', ''),
                            description_source="ai"
                        )
                        
                        # Check if column already exists
                        existing_column = None
                        try:
                            existing_columns = await self.get_training_columns(db, connection_id)
                            existing_column = next((col for col in existing_columns if col.column_name == column_name), None)
                        except:
                            pass
                        
                        if existing_column:
                            # Update existing
                            update_data = TrainingColumnSchemaUpdate(description=description, description_source="ai")
                            await self.update_training_column(db, connection_id, existing_column.id, update_data)
                        else:
                            # Create new
                            await self.create_training_column(db, connection_id, column_data)
                        
                        await sse_manager.send_to_task(task_id, "description_generated", {
                            "column_name": column_name,
                            "description": description,
                            "data_type": column_info.get('data_type', ''),
                            "variable_range": column_info.get('variable_range', ''),
                            "progress": progress,
                            "total_columns": total_columns
                        })
                        
                        generated_count += 1
                        await sse_logger.info(f"Generated description for {column_name}: {description[:50]}...")
                    
                except Exception as e:
                    await sse_logger.warning(f"Failed to generate description for {column_name}: {str(e)}")
                    continue
                
                # Small delay to prevent rate limiting
                await asyncio.sleep(0.2)
            
            await sse_logger.progress(100, f"Generated {generated_count} column descriptions")
            await sse_logger.info(f"AI generation completed for user {user.email}")
            
            return {
                "success": True,
                "generated_count": generated_count,
                "total_columns": total_columns,
                "skipped_count": total_columns - generated_count
            }
            
        except Exception as e:
            error_msg = f"AI column description generation failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            await sse_logger.error(error_msg)
            return {"success": False, "error_message": error_msg}

    async def _generate_single_column_description(
        self,
        client,
        connection: Connection,
        column_name: str,
        column_info: Dict[str, Any],
        sse_logger: SSELogger
    ) -> Optional[str]:
        """Generate description for a single column"""
        try:
            data_type = column_info.get('data_type', '')
            variable_range = column_info.get('variable_range', '')
            
            # Build context for the column
            context_parts = []
            
            # Add sample values/categories
            if 'categories' in column_info and column_info['categories']:
                sample_values = ', '.join(str(val) for val in column_info['categories'][:10])
                context_parts.append(f"Sample values: {sample_values}")
            
            if 'range' in column_info:
                range_info = column_info['range']
                context_parts.append(f"Numeric range: {range_info['min']} to {range_info['max']} (avg: {range_info['avg']:.2f})")
            
            if 'date_range' in column_info:
                date_range = column_info['date_range']
                context_parts.append(f"Date range: {date_range['min']} to {date_range['max']}")
            
            context_str = " | ".join(context_parts) if context_parts else "No sample data available"
            
            # Create AI prompt
            prompt = f"""You are a database analyst helping to document a SQL Server table called '{connection.table_name}'.

    Column Name: {column_name}
    Data Type: {data_type}
    Data Context: {context_str}

    Generate a clear, concise business description for this column (50-150 characters). The description should:
    - Explain what this column represents in business terms
    - Be clear to non-technical users
    - Avoid technical jargon
    - Be specific and actionable

    Examples of good descriptions:
    - "Unique customer identification number"
    - "Product sale price in USD"
    - "Employee hire date"
    - "Order status (pending, shipped, delivered)"

    Generate only the description text, no quotes or additional formatting."""

            response = client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a helpful database documentation assistant."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=100
            )
            
            description = response.choices[0].message.content.strip()
            
            # Basic validation
            if len(description) < 10 or len(description) > 200:
                await sse_logger.warning(f"Generated description for {column_name} has invalid length: {len(description)}")
                return None
            
            # Remove quotes if present
            description = description.strip('"\'')
            
            return description
            
        except Exception as e:
            await sse_logger.warning(f"Failed to generate description for {column_name}: {str(e)}")
            return None
    # ========================
    # MIGRATION METHODS
    # ========================
    
    async def migrate_existing_training_data(
        self,
        db: AsyncSession,
        connection_id: str,
        user: User
    ) -> bool:
        """Migrate existing JSON training data to database"""
        try:
            # Load existing JSON data
            training_data_path = os.path.join(
                self.data_dir, "connections", connection_id, "generated_training_data.json"
            )
            
            if not os.path.exists(training_data_path):
                logger.info(f"No existing training data to migrate for connection {connection_id}")
                return True
            
            with open(training_data_path, 'r') as f:
                training_data = json.load(f)
            
            connection_uuid = uuid.UUID(connection_id)
            
            # Migrate documentation
            documentation = training_data.get('documentation', [])
            for doc_entry in documentation:
                doc = TrainingDocumentation(
                    connection_id=connection_uuid,
                    title=doc_entry.get('doc_type', 'Untitled'),
                    doc_type=doc_entry.get('doc_type', 'general'),
                    content=doc_entry.get('content', ''),
                    category='migrated'
                )
                db.add(doc)
            
            # Migrate examples (question-SQL pairs)
            examples = training_data.get('examples', [])
            for example_entry in examples:
                question = TrainingQuestionSql(
                    connection_id=connection_uuid,
                    question=example_entry.get('question', ''),
                    sql=example_entry.get('sql', ''),
                    generated_by='ai',
                    generation_model='migrated'
                )
                db.add(question)
            
            await db.commit()
            
            # Backup original file
            backup_path = training_data_path + '.migrated_backup'
            os.rename(training_data_path, backup_path)
            
            logger.info(f"Migrated training data for connection {connection_id}")
            return True
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to migrate training data for connection {connection_id}: {e}")
            return False

    # ========================
    # UPDATED USER-SPECIFIC METHODS
    # ========================
    
    async def get_user_training_data(
        self, 
        db: AsyncSession, 
        user: User, 
        connection_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get training data for a user's connection from database"""
        try:
            # Verify user owns the connection
            connection_response = await connection_service.get_user_connection(db, str(user.id), connection_id)
            if not connection_response:
                logger.warning(f"Training data access denied for user {user.email}, connection {connection_id}")
                return None
            
            # Get training data from database using new methods
            documentation = await self.get_training_documentation(db, connection_id)
            questions = await self.get_training_questions(db, connection_id)
            columns = await self.get_training_columns(db, connection_id)
            
            training_data = {
                "user_id": str(user.id),
                "user_email": user.email,
                "connection_id": connection_id,
                "connection_name": connection_response.name,
                "connection_status": connection_response.status,
                "documentation": [
                    {"title": doc.title, "doc_type": doc.doc_type, "content": doc.content}
                    for doc in documentation
                ],
                "examples": [
                    {"question": q.question, "sql": q.sql}
                    for q in questions
                ],
                "column_schema": [
                    {
                        "column_name": col.column_name,
                        "data_type": col.data_type,
                        "description": col.description,
                        "value_range": col.value_range
                    }
                    for col in columns
                ],
                "total_examples": len(questions),
                "total_documentation": len(documentation),
                "total_columns": len(columns)
            }
            
            return training_data
            
        except Exception as e:
            logger.error(f"Failed to get training data for user {user.email}, connection {connection_id}: {e}")
            return None
    
    async def delete_user_training_data(
        self, 
        db: AsyncSession, 
        user: User, 
        connection_id: str
    ) -> bool:
        """Delete training data for a user's connection"""
        try:
            # Verify user owns the connection
            connection_response = await connection_service.get_user_connection(db, str(user.id), connection_id)
            if not connection_response:
                logger.warning(f"Training data deletion denied for user {user.email}, connection {connection_id}")
                return False
            
            connection_uuid = uuid.UUID(connection_id)
            
            # Delete all training data from database
            await db.execute(delete(TrainingDocumentation).where(TrainingDocumentation.connection_id == connection_uuid))
            await db.execute(delete(TrainingQuestionSql).where(TrainingQuestionSql.connection_id == connection_uuid))
            await db.execute(delete(TrainingColumnSchema).where(TrainingColumnSchema.connection_id == connection_uuid))
            
            # Delete old training examples table data
            await db.execute(delete(TrainingExample).where(TrainingExample.connection_id == connection_uuid))
            
            # Reset connection examples count
            update_stmt = (
                update(Connection)
                .where(Connection.id == connection_uuid)
                .values(
                    generated_examples_count=0,
                    status=ConnectionStatus.TEST_SUCCESS
                )
            )
            await db.execute(update_stmt)
            await db.commit()
            
            # Optionally delete backup file if it exists
            connection_dir = os.path.join(self.data_dir, "connections", connection_id)
            training_file = os.path.join(connection_dir, "generated_training_data.json")
            
            if os.path.exists(training_file):
                os.remove(training_file)
                logger.info(f"Deleted training data backup file for user {user.email}, connection {connection_id}")
            
            return True
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete training data for user {user.email}, connection {connection_id}: {e}")
            return False

# Global training service instance
training_service = TrainingService()