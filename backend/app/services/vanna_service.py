import os
import json
import shutil
from typing import Optional, Dict, Any, List, Callable
import logging
from sqlalchemy.ext.asyncio import AsyncSession
import time
import stat
import gc

from app.models.vanna_models import VannaConfig, DatabaseConfig, VannaTrainingData, TrainingDocumentation, TrainingExample
from app.models.database import Model, ModelStatus, Connection
from sqlalchemy import select
from app.config import settings
from app.core.vanna_wrapper import MyVanna
from app.models.database import User

logger = logging.getLogger(__name__)


class VannaService:
    """Stateless service for managing Vanna AI instances - no persistent connections"""
    
    def __init__(self):
        self.data_dir = settings.DATA_DIR
        # NO instance caching - everything is stateless
    
    def _get_chromadb_path(self, model_id: str) -> str:
        """Get the ChromaDB path for a model - always use timestamp for fresh training"""
        timestamp = int(time.time())
        return os.path.join(self.data_dir, "models", model_id, f"chromadb_store_{timestamp}")
    
    def _get_latest_chromadb_path(self, model_id: str) -> str:
        """Get the latest ChromaDB path for querying"""
        model_dir = os.path.join(self.data_dir, "models", model_id)
        if not os.path.exists(model_dir):
            return None
            
        # Find the latest chromadb directory
        chromadb_dirs = []
        for item in os.listdir(model_dir):
            if item.startswith('chromadb_store_'):
                try:
                    timestamp = int(item.split('_')[-1])
                    chromadb_dirs.append((timestamp, os.path.join(model_dir, item)))
                except ValueError:
                    continue
        
        if not chromadb_dirs:
            return None
            
        # Return the latest one
        chromadb_dirs.sort(reverse=True)
        return chromadb_dirs[0][1]
    
    def _verify_clean_state(self, model_id: str) -> bool:
        """Verify that ChromaDB is completely clean"""
        model_dir = os.path.join(self.data_dir, "models", model_id)
        
        if not os.path.exists(model_dir):
            return True
            
        # Check for any chromadb_store directories
        chromadb_dirs = [item for item in os.listdir(model_dir) if item.startswith('chromadb_store')]
        
        if chromadb_dirs:
            logger.warning(f"Found {len(chromadb_dirs)} remaining ChromaDB directories: {chromadb_dirs}")
            return False
            
        logger.info(f"Verified clean state for model {model_id}")
        return True
    
    def _ensure_directory_writable(self, path: str) -> None:
        """Ensure directory exists and is writable with full permissions"""
        try:
            # Remove directory if it exists to start completely fresh
            if os.path.exists(path):
                logger.info(f"🔥 Removing existing directory for fresh start: {path}")
                shutil.rmtree(path)
            
            # Create new directory with full permissions
            os.makedirs(path, exist_ok=True)
            os.chmod(path, 0o777)  # Full permissions for all
            
            # Set umask to ensure new files are created with write permissions
            old_umask = os.umask(0o000)
            
            # Test write permissions
            test_file = os.path.join(path, ".write_test")
            with open(test_file, 'w') as f:
                f.write("test")
            os.chmod(test_file, 0o666)
            os.remove(test_file)
            
            # Restore umask
            os.umask(old_umask)
            
            logger.info(f"🔥 Directory confirmed writable with full permissions: {path}")
        except Exception as e:
            logger.error(f"Directory not writable: {path}, error: {e}")
            raise
    
    def _force_cleanup_chromadb(self, model_id: str) -> None:
        """Force cleanup of all ChromaDB directories for a model"""
        model_dir = os.path.join(self.data_dir, "models", model_id)
        
        if os.path.exists(model_dir):
            # Remove all chromadb_store directories
            for item in os.listdir(model_dir):
                if item.startswith('chromadb_store'):
                    item_path = os.path.join(model_dir, item)
                    try:
                        shutil.rmtree(item_path)
                        logger.info(f"Removed ChromaDB directory: {item_path}")
                    except Exception as e:
                        logger.error(f"Failed to remove ChromaDB directory {item_path}: {e}")
        
        logger.info(f"COMPLETE ChromaDB cleanup for model {model_id}")
    
    def _cleanup_old_chromadb_directories(self, model_id: str, keep_latest: int = 1) -> int:
        """Clean up old ChromaDB directories, keeping only the latest N"""
        model_dir = os.path.join(self.data_dir, "models", model_id)
        
        if not os.path.exists(model_dir):
            return 0
        
        # Find all chromadb directories with timestamps
        chromadb_dirs = []
        for item in os.listdir(model_dir):
            if item.startswith('chromadb_store_'):
                try:
                    timestamp = int(item.split('_')[-1])
                    chromadb_dirs.append((timestamp, os.path.join(model_dir, item)))
                except ValueError:
                    continue
        
        if len(chromadb_dirs) <= keep_latest:
            return 0
        
        # Sort by timestamp (oldest first)
        chromadb_dirs.sort()
        
        # Remove oldest directories (keep the latest N)
        removed_count = 0
        for timestamp, dir_path in chromadb_dirs[:-keep_latest]:
            try:
                shutil.rmtree(dir_path)
                logger.info(f"Removed old ChromaDB directory: {dir_path}")
                removed_count += 1
            except Exception as e:
                logger.error(f"Failed to remove old ChromaDB directory {dir_path}: {e}")
        
        logger.info(f"Removed {removed_count} ChromaDB directories for model {model_id}")
        return removed_count
    
    async def setup_and_train_vanna(
        self,
        model_id: str,
        db_config: DatabaseConfig,
        vanna_config: VannaConfig,
        retrain: bool = False,
        progress_callback: Optional[Callable[[int, str], None]] = None,
        user: Optional[User] = None,
        db: Optional[AsyncSession] = None
    ) -> Optional[MyVanna]:
        """Setup and train a Vanna instance for a model"""
        user_info = f" (user: {user.email})" if user else ""
        
        try:
            logger.info(f"Starting Vanna setup for model {model_id}{user_info}")
            
            if progress_callback:
                await progress_callback(10, "Initializing Vanna instance...")
            
            # Get ChromaDB path for this model
            chromadb_path = self._get_chromadb_path(model_id)
            
            # Ensure clean state if retraining
            if retrain:
                logger.info(f"Retraining requested for model {model_id} - cleaning up existing data")
                if progress_callback:
                    await progress_callback(15, "Cleaning up existing training data...")
                self._force_cleanup_chromadb(model_id)
            
            # Ensure directory is writable
            self._ensure_directory_writable(os.path.dirname(chromadb_path))
            
            if progress_callback:
                await progress_callback(20, "Connecting to database...")
            
            # Create Vanna instance with ChromaDB path in config
            logger.info(f"ChromaDB path being set: {chromadb_path}")
            vanna_config_dict = vanna_config.dict() if hasattr(vanna_config, 'dict') else {
                "api_key": vanna_config.api_key,
                "base_url": vanna_config.base_url,
                "model": vanna_config.model,
                "path": chromadb_path
            }
            # Always add the path to the config dict
            vanna_config_dict["path"] = chromadb_path
            logger.info(f"Vanna config dict: {vanna_config_dict}")
            
            vanna_instance = MyVanna(config=vanna_config_dict)
            
            # Connect to database
            vanna_instance.connect_to_database(db_config)
            
            logger.info(f"Vanna connected to database for model {model_id}{user_info}")
            
            if progress_callback:
                await progress_callback(30, "Training model with data...")
            
            # Train the model
            await self._train_vanna_instance(vanna_instance, model_id, progress_callback, user, db)
            
            logger.info(f"Vanna setup completed successfully for model {model_id}{user_info}")
            
            return vanna_instance
            
        except Exception as e:
            error_msg = f"Failed to setup Vanna for model {model_id}{user_info}: {e}"
            logger.error(error_msg)
            raise
    
    async def _train_vanna_instance(
        self,
        vanna_instance: MyVanna,
        model_id: str,
        progress_callback: Optional[Callable[[int, str], None]] = None,
        user: Optional[User] = None,
        db: Optional[AsyncSession] = None
    ) -> None:
        """Train a Vanna instance with model-specific training data"""
        user_info = f" (user: {user.email})" if user else ""
        
        try:
            if progress_callback:
                await progress_callback(40, "Loading training data...")
            
            # Clear old training data from ChromaDB to ensure fresh training
            try:
                vanna_instance.clear_training_data()
                logger.info("Cleared old training data from ChromaDB")
            except Exception as e:
                logger.error(f"Failed to clear training data: {e}")
                # Continue with training even if clearing fails
            
            # Get training data for this model
            from app.services.training_service import training_service
            
            if db:
                documentation = await training_service.get_model_training_documentation(db, model_id)
                questions = await training_service.get_model_training_questions(db, model_id)
                columns = await training_service.get_model_training_columns(db, model_id)
            else:
                # Fallback to empty data if no DB session
                documentation = []
                questions = []
                columns = []
            
            if progress_callback:
                await progress_callback(50, f"Training with {len(questions)} examples...")
            
            # Convert to Vanna training data format
            training_data = VannaTrainingData(
                documentation=[
                    TrainingDocumentation(
                        doc_type=doc.doc_type,
                        content=doc.content
                    ) for doc in documentation
                ],
                examples=[
                    TrainingExample(
                        question=q.question,
                        sql=q.sql
                    ) for q in questions
                ],
                column_descriptions=[
                    {
                        "table_name": col.table_name,
                        "column_name": col.column_name,
                        "data_type": col.data_type,
                        "description": col.description or ""
                    } for col in columns
                ]
            )
            
            if not training_data.examples and not training_data.documentation:
                logger.warning(f"No training data found for model {model_id}{user_info}")
                if progress_callback:
                    await progress_callback(100, "No training data available")
                return
            
            # Train the model with each type of data
            if progress_callback:
                await progress_callback(60, "Training Vanna model...")
            
            # Train with documentation
            for doc in training_data.documentation:
                try:
                    vanna_instance.train(documentation=doc.content)
                    logger.info(f"Trained documentation: {doc.doc_type}")
                except Exception as e:
                    logger.error(f"Failed to train documentation {doc.doc_type}: {e}")
            
            # Train with examples (question-SQL pairs)
            for example in training_data.examples:
                try:
                    vanna_instance.train(question=example.question, sql=example.sql)
                    logger.info(f"Trained example: {example.question[:50]}...")
                except Exception as e:
                    logger.error(f"Failed to train example: {e}")
            
            # Train with column descriptions as documentation
            for col_desc in training_data.column_descriptions:
                try:
                    content = f"Column '{col_desc['column_name']}' ({col_desc['data_type']}): {col_desc['description']}"
                    vanna_instance.train(documentation=content)
                    logger.info(f"Trained column description: {col_desc['column_name']}")
                except Exception as e:
                    logger.error(f"Failed to train column description {col_desc['column_name']}: {e}")
            
            # Train with database schema (DDL) - CRITICAL MISSING STEP!
            if db:
                try:
                    # Get the model's tracked tables and columns directly
                    from app.models.database import Model, ModelTrackedTable, ModelTrackedColumn
                    from sqlalchemy import select
                    
                    # Get tracked tables for this model
                    tables_result = await db.execute(
                        select(ModelTrackedTable)
                        .where(ModelTrackedTable.model_id == model_id, ModelTrackedTable.is_active == True)
                    )
                    tracked_tables = tables_result.scalars().all()
                    
                    if tracked_tables:
                        logger.info(f"Training with {len(tracked_tables)} tracked tables")
                        
                        for tracked_table in tracked_tables:
                            try:
                                # Get columns for this table
                                columns_result = await db.execute(
                                    select(ModelTrackedColumn)
                                    .where(ModelTrackedColumn.model_tracked_table_id == tracked_table.id)
                                )
                                tracked_columns = columns_result.scalars().all()
                                
                                # Create DDL-like documentation for the table
                                columns_info = []
                                for col in tracked_columns:
                                    if col.is_tracked:
                                        col_info = f"[{col.column_name}]"
                                        if col.value_data_type:
                                            col_info += f" ({col.value_data_type})"
                                        if col.description:
                                            col_info += f" - {col.description}"
                                        columns_info.append(col_info)
                                
                                if columns_info:
                                    # Create table DDL documentation
                                    full_table_name = f"{tracked_table.schema_name}.{tracked_table.table_name}" if tracked_table.schema_name else tracked_table.table_name
                                    ddl_doc = f"Table {full_table_name}:\n" + "\n".join(columns_info)
                                    
                                    # Train with this table's DDL
                                    vanna_instance.train(documentation=ddl_doc)
                                    logger.info(f"Trained DDL for table: {full_table_name}")
                                
                            except Exception as e:
                                logger.error(f"Failed to train DDL for table {tracked_table.table_name}: {e}")
                    else:
                        logger.warning(f"No tracked tables found for model {model_id}")
                        
                except Exception as e:
                    logger.error(f"Failed to train database schema (DDL): {e}")
                    # Don't fail training if DDL training fails, just log it
            else:
                logger.warning("No database session available for DDL training")
            
            if progress_callback:
                await progress_callback(100, "Training completed successfully")
            
            logger.info(f"Vanna training completed for model {model_id}{user_info}")
            
        except Exception as e:
            error_msg = f"Failed to train Vanna instance for model {model_id}{user_info}: {e}"
            logger.error(error_msg)
            raise
    
    async def query_model(
        self,
        model_id: str,
        question: str,
        user: Optional[User] = None,
        db: Optional[AsyncSession] = None
    ) -> Optional[str]:
        """Query a trained model"""
        user_info = f" (user: {user.email})" if user else ""
        
        try:
            # Get latest ChromaDB path
            chromadb_path = self._get_latest_chromadb_path(model_id)
            
            if not chromadb_path:
                logger.warning(f"No trained model found for model {model_id}{user_info}")
                return None
            
            # Create fresh Vanna instance
            vanna_config_dict = {
                "api_key": settings.OPENAI_API_KEY,
                "base_url": settings.OPENAI_BASE_URL,
                "model": settings.OPENAI_MODEL,
                "path": chromadb_path
            }
            
            vanna_instance = MyVanna(config=vanna_config_dict)
            
            logger.info(f"Fresh Vanna instance created for model {model_id}{user_info}")
            
            # Get model's connection for database access
            if db:
                from app.services.connection_service import connection_service
                result = await db.execute(select(Model).where(Model.id == model_id))
                model = result.scalar_one_or_none()
                if model:
                    connection = await connection_service.get_connection_by_id(db, str(model.connection_id))
                    if connection:
                        # Create database config
                        from app.models.vanna_models import DatabaseConfig
                        db_config = DatabaseConfig(
                            server=connection.server,
                            database_name=connection.database_name,
                            username=connection.username,
                            password=connection.password,
                            driver=connection.driver or 'ODBC Driver 17 for SQL Server',
                            encrypt=connection.encrypt,
                            trust_server_certificate=connection.trust_server_certificate
                        )
                        
                        # Connect to database
                        vanna_instance.connect_to_database(db_config)
                        logger.info(f"Connected to database for querying model {model_id}{user_info}")
            
            # Execute query
            result = vanna_instance.generate_sql(question)
            return result
            
        except Exception as e:
            logger.error(f"Failed to create Vanna instance for model {model_id}{user_info}: {e}")
            return None
    
    def cleanup_model_data(self, model_id: str, user: Optional[User] = None) -> bool:
        """Clean up all data for a model"""
        user_info = f" (user: {user.email})" if user else ""
        
        try:
            # Clean up ChromaDB directories
            self._force_cleanup_chromadb(model_id)
            
            # Clean up training data files
            training_data_path = os.path.join(self.data_dir, "models", model_id, "generated_training_data.json")
            if os.path.exists(training_data_path):
                os.remove(training_data_path)
                logger.info(f"Cleaned up training data for model {model_id}{user_info}")
            
            # Remove model directory if empty
            model_dir = os.path.join(self.data_dir, "models", model_id)
            if os.path.exists(model_dir) and not os.listdir(model_dir):
                os.rmdir(model_dir)
                logger.info(f"Removed empty model directory for {model_id}{user_info}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to cleanup Vanna model for model {model_id}{user_info}: {e}")
            return False

# Global instance
vanna_service = VannaService()