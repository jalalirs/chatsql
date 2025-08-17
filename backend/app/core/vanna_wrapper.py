import os
import json
import shutil
from typing import Optional, Dict, Any, List
import logging
from sqlalchemy.ext.asyncio import AsyncSession

from vanna.openai import OpenAI_Chat
from vanna.chromadb import ChromaDB_VectorStore
import openai
import httpx

from app.models.vanna_models import VannaConfig, DatabaseConfig, VannaTrainingData
from app.models.database import User
from app.config import settings

logger = logging.getLogger(__name__)

class MyVanna(OpenAI_Chat, ChromaDB_VectorStore):
    """Custom Vanna implementation for MS SQL Server"""
    
    def __init__(self, config=None):
        logger.info(f"MyVanna config received: {config}")
        
        # Initialize OpenAI client
        client = openai.OpenAI(
            base_url=config.get("base_url", settings.OPENAI_BASE_URL),
            api_key=config.get("api_key", settings.OPENAI_API_KEY),
            http_client=httpx.Client(verify=False)
        )
        

        
        # Set ChromaDB path explicitly for new client format
        chromadb_path = config.get("path", "./chroma")
        logger.info(f"ChromaDB path from config: {chromadb_path}")
        
        # Create ChromaDB config for new client format with explicit persistence settings
        chroma_config = {
            "path": chromadb_path,
            "anonymized_telemetry": False,
            "is_persistent": True,
            "allow_reset": True
        }
        
        logger.info(f"Setting ChromaDB path to: {chromadb_path}")
        logger.info(f"ChromaDB config: {chroma_config}")
        

        
        # Debug: log the exact config being passed
        logger.info(f"Config being passed to OpenAI_Chat: {config}")
        logger.info(f"Config keys: {list(config.keys()) if config else 'None'}")
        logger.info(f"Model in config: {config.get('model') if config else 'None'}")
        
        OpenAI_Chat.__init__(self, config=config, client=client)
        ChromaDB_VectorStore.__init__(self, config=chroma_config)
        
        # Store the config for our overridden method
        self._vanna_config = config
        
        # Test ChromaDB write permissions after initialization
        self._test_chromadb_write_permissions(chromadb_path)
        
        # Override the submit_prompt method to force use of configured model
        import types
        def submit_prompt_with_forced_model(self, prompt, **kwargs):
            """Override to force use of configured model instead of hardcoded fallback"""
            if self._vanna_config and "model" in self._vanna_config:
                model = self._vanna_config["model"]
                logger.info(f"Using configured model: {model}")
                
                # Log the prompt being sent to the LLM
                logger.info(f"Prompt being sent to LLM: {prompt}")
                logger.info(f"Prompt type: {type(prompt)}")
                if isinstance(prompt, list):
                    for i, msg in enumerate(prompt):
                        logger.info(f"Message {i}: {msg}")
                
                response = self.client.chat.completions.create(
                    model=model,
                    messages=prompt,
                    stop=None,
                    temperature=self.temperature,
                )
            else:
                # Fallback to parent method if no config
                logger.warning("No model config found, using parent method")
                return super().submit_prompt(prompt, **kwargs)
            
            # Process response
            for choice in response.choices:
                if hasattr(choice, 'text') and choice.text:
                    return choice.text
            return response.choices[0].message.content
        
        # Bind the method to this instance
        self.submit_prompt = types.MethodType(submit_prompt_with_forced_model, self)
        
        # Override the generate_sql method to use our custom prompt logic with DDL
        def generate_sql_with_custom_prompt(self, question: str, **kwargs):
            """Override generate_sql to use our custom prompt logic with DDL"""
            logger.info("Using custom generate_sql method")
            
            # Get training data from ChromaDB
            question_sql_list = self.get_similar_question_sql(question, k=5)
            logger.info(f"Found {len(question_sql_list) if question_sql_list else 0} similar Q&A pairs")
            
            # Since we now train with DDL during training, we can use Vanna's built-in method
            # The DDL information is already in ChromaDB from the training phase
            logger.info("Using Vanna's built-in generate_sql since DDL is now trained")
            
            # Call the parent method which will use all the trained data (including DDL)
            sql = super().generate_sql(question, **kwargs)
            
            # Fix TOP spacing issues
            sql = self.fix_top_spacing(sql)
            
            return sql
        
        # Bind the custom generate_sql method
        self.generate_sql = types.MethodType(generate_sql_with_custom_prompt, self)
    
    def fix_top_spacing(self, sql: str) -> str:
        """Fix TOP1 spacing issues in generated SQL"""
        if sql:
            # Fix TOP1 -> TOP 1, TOP2 -> TOP 2, etc.
            import re
            sql = re.sub(r'TOP(\d+)', r'TOP \1', sql)
            logger.info(f"Fixed TOP spacing in SQL: {sql}")
        return sql
    
    def clear_training_data(self):
        """Clear all training data from ChromaDB to ensure fresh training"""
        try:
            # Get the ChromaDB path
            chromadb_path = self._vanna_config.get("path", "./chroma")
            logger.info(f"Clearing ChromaDB at path: {chromadb_path}")
            
            # Remove the entire ChromaDB directory
            if os.path.exists(chromadb_path):
                shutil.rmtree(chromadb_path)
                logger.info(f"Removed ChromaDB directory: {chromadb_path}")
            
            # Reinitialize ChromaDB
            ChromaDB_VectorStore.__init__(self, config={"path": chromadb_path, "anonymized_telemetry": False})
            logger.info("ChromaDB reinitialized after clearing")
            
        except Exception as e:
            logger.error(f"Failed to clear training data: {e}")
            raise
    
    def connect_to_database(self, db_config):
        """Connect to MS SQL Server database"""
        try:
            # Build ODBC connection string
            encrypt_str = 'yes' if db_config.encrypt else 'no'
            trust_cert_str = 'yes' if db_config.trust_server_certificate else 'no'
            
            odbc_conn_str = (
                f"DRIVER={db_config.driver or 'ODBC Driver 17 for SQL Server'};"
                f"SERVER={db_config.server};"
                f"DATABASE={db_config.database_name};"
                f"UID={db_config.username};"
                f"PWD={db_config.password};"
                f"Encrypt={encrypt_str};"
                f"TrustServerCertificate={trust_cert_str};"
            )
            
            # Connect using the parent class method
            self.connect_to_mssql(odbc_conn_str=odbc_conn_str)
            logger.info(f"Connected to database: {db_config.database_name} on {db_config.server}")
            
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def _test_chromadb_write_permissions(self, chromadb_path: str):
        """Test ChromaDB write permissions to ensure persistence is working"""
        try:
            logger.info(f"Testing ChromaDB write permissions at: {chromadb_path}")
            
            # Ensure directory exists
            os.makedirs(chromadb_path, exist_ok=True)
            
            # Test file creation
            test_file = os.path.join(chromadb_path, ".write_test")
            with open(test_file, 'w') as f:
                f.write("test")
            
            # Test file reading
            with open(test_file, 'r') as f:
                content = f.read()
            
            # Clean up test file
            os.remove(test_file)
            
            logger.info(f"✅ ChromaDB write permissions test passed at: {chromadb_path}")
            
        except Exception as e:
            logger.error(f"❌ ChromaDB write permissions test failed at {chromadb_path}: {e}")
            raise