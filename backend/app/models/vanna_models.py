from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class VannaConfig(BaseModel):
    """Configuration for Vanna instance"""
    api_key: str
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4"
    max_tokens: int = 4000
    temperature: float = 0.1
    
class DatabaseConfig(BaseModel):
    """Database connection configuration for Vanna"""
    server: str
    database_name: str
    username: str
    password: str
    driver: Optional[str] = Field(
        default="ODBC Driver 17 for SQL Server",
        description="Database driver name"
    )
    encrypt: bool = Field(
        default=False,
        description="Whether to use encryption for the connection"
    )
    trust_server_certificate: bool = Field(
        default=True,
        description="Whether to trust the server certificate"
    )
    
    def to_odbc_connection_string(self) -> str:
        """Convert to ODBC connection string for SQL Server"""
        # Use the driver field, fallback to default if None/empty
        driver_name = self.driver if self.driver and self.driver.strip() else "ODBC Driver 17 for SQL Server"
        
        connection_string =  (
            f"DRIVER={{{driver_name}}};"
            f"SERVER={self.server};"
            f"DATABASE={self.database_name};"
            f"UID={self.username};"
            f"PWD={self.password};"
            f"Encrypt={'yes' if self.encrypt else 'no'};"
            f"TrustServerCertificate={'yes' if self.trust_server_certificate else 'no'};"
        )
        return connection_string

class ColumnInfo(BaseModel):
    """Column information from database schema analysis"""
    column_name: str
    data_type: str
    categories: Optional[List[str]] = None  # For categorical columns
    range: Optional[Dict[str, float]] = None  # For numerical columns: {"min": x, "max": y, "avg": z}
    date_range: Optional[Dict[str, str]] = None  # For date columns: {"min": "date", "max": "date"}
    
class TrainingDocumentation(BaseModel):
    """Documentation entry for Vanna training"""
    doc_type: str  # e.g., "mssql_conventions", "table_info", "column_details"
    content: str

class TrainingExample(BaseModel):
    """Training example (question-SQL pair)"""
    question: str
    sql: str

class VannaTrainingData(BaseModel):
    """Complete training data structure"""
    documentation: List[TrainingDocumentation]
    examples: List[TrainingExample]
    column_descriptions: Optional[List[Dict[str, str]]] = None  # From uploaded CSV
    # User context for training data
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    generated_at: Optional[datetime] = None

# Data Generation Models
class DataGenerationConfig(BaseModel):
    """Configuration for LLM-based data generation"""
    num_examples: int = Field(default=20, ge=1, le=100)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_retries: int = Field(default=3, ge=1, le=10)
    # User context
    user_id: Optional[str] = None
    
class GeneratedDataResult(BaseModel):
    """Result of data generation process"""
    success: bool
    total_generated: int
    failed_count: int
    examples: List[TrainingExample]
    documentation: List[TrainingDocumentation]
    generation_time: float
    error_message: Optional[str] = None
    # Enhanced metadata
    connection_id: Optional[str] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    generated_at: Optional[datetime] = None

# Training Models
class TrainingConfig(BaseModel):
    """Configuration for model training"""
    model_id: str
    num_examples: int = Field(default=50, ge=1, le=200)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_retries: int = Field(default=3, ge=1, le=10)

class ChartResponse(BaseModel):
    """Response for chart generation"""
    chart_type: str
    data: Dict[str, Any]
    config: Optional[Dict[str, Any]] = None

# MS SQL Server specific constants and templates
class MSSQLConstants:
    """Constants for MS SQL Server specific operations"""
    
    DRIVER_STRING = "ODBC Driver 17 for SQL Server"
    
    # MS SQL Server conventions documentation
    MSSQL_CONVENTIONS_DOC = """When generating SQL queries for Microsoft SQL Server, always adhere to the following specific syntax and conventions. Unlike other SQL dialects, MS SQL Server uses square brackets [] to delimit identifiers (like table or column names), especially if they are SQL keywords (e.g., [View]) or contain spaces. For limiting the number of rows returned, always use the TOP N clause immediately after the SELECT keyword, ensuring there is a space between TOP and the numerical value (e.g., SELECT TOP 5 Company_Name). The LIMIT and OFFSET keywords, commonly found in MySQL or PostgreSQL, are not standard. For string concatenation, use the + operator. Date and time manipulation often relies on functions like GETDATE(), DATEADD(), DATEDIFF(), and CONVERT(). Handle NULL values using IS NULL, IS NOT NULL, or functions like ISNULL(expression, replacement) and COALESCE(expression1, expression2, ...). While often case-insensitive by default depending on collation, it's best practice to match casing with database objects. Complex queries frequently leverage Common Table Expressions (CTEs) defined with WITH for readability and structuring multi-step logic. Pay close attention to correct spacing and keyword usage to avoid syntax errors."""
    
    # SQL keywords that need brackets
    SQL_KEYWORDS = {
        'view', 'table', 'index', 'key', 'order', 'group', 'having', 
        'where', 'select', 'from', 'join', 'union', 'case', 'when', 
        'then', 'else', 'end', 'as', 'distinct', 'top', 'percent'
    }
    
    @classmethod
    def should_bracket_identifier(cls, identifier: str) -> bool:
        """Check if an identifier should be wrapped in brackets"""
        return (
            identifier.lower() in cls.SQL_KEYWORDS or
            ' ' in identifier or
            '-' in identifier or
            identifier.startswith(tuple('0123456789'))
        )