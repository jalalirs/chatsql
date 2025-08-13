from pydantic import BaseModel, Field, EmailStr, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


# ========================
# CORE ENUMS
# ========================

class ConnectionStatus(str, Enum):
    TESTING = "testing"
    TEST_SUCCESS = "test_success"
    TEST_FAILED = "test_failed"

class TaskType(str, Enum):
    TEST_CONNECTION = "test_connection"
    QUERY = "query"
    REFRESH_SCHEMA = "refresh_schema"  


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"

class MessageType(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"



# ========================
# USER MANAGEMENT SCHEMAS
# ========================

class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=30, pattern="^[a-zA-Z0-9_-]+$")
    full_name: Optional[str] = Field(None, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    company: Optional[str] = Field(None, max_length=255)
    job_title: Optional[str] = Field(None, max_length=255)

    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: Optional[str] = None
    role: UserRole
    is_active: bool
    is_verified: bool
    profile_picture_url: Optional[str] = None
    bio: Optional[str] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    created_at: datetime
    last_login_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    bio: Optional[str] = Field(None, max_length=1000)
    company: Optional[str] = Field(None, max_length=255)
    job_title: Optional[str] = Field(None, max_length=255)
    profile_picture_url: Optional[str] = Field(None, max_length=500)

class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @validator('new_password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class PasswordReset(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse

class TokenRefresh(BaseModel):
    refresh_token: str

class EmailVerification(BaseModel):
    token: str


# ========================
# CONNECTION SCHEMAS
# ========================

class ConnectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Connection name (unique per user)")
    server: str = Field(..., min_length=1, description="Database server address")
    database_name: str = Field(..., min_length=1, description="Database name")
    username: str = Field(..., min_length=1, description="Database username")
    password: str = Field(..., min_length=1, description="Database password")
    driver: Optional[str] = Field(None, description="Database driver")
    encrypt: Optional[bool] = Field(False, description="Whether to encrypt the connection")
    trust_server_certificate: Optional[bool] = Field(True, description="Whether to trust server certificate")

class ConnectionTestRequest(BaseModel):
    connection_data: ConnectionCreate

class ConnectionTestResult(BaseModel):
    success: bool
    error_message: Optional[str] = None
    sample_data: Optional[List[Dict[str, Any]]] = None
    column_info: Optional[Dict[str, Any]] = None
    task_id: str

class ConnectionResponse(BaseModel):
    id: str
    name: str
    server: str
    database_name: str
    driver: Optional[str] = None
    encrypt: bool = False
    trust_server_certificate: bool = True
    status: ConnectionStatus
    test_successful: bool
    database_schema: Optional[Dict[str, Any]] = None
    last_schema_refresh: Optional[datetime] = None
    total_queries: int = 0
    last_queried_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ConnectionListResponse(BaseModel):
    connections: List[ConnectionResponse]
    total: int

class ConnectionDeleteResponse(BaseModel):
    success: bool
    message: str





# ========================
# CONVERSATION & MESSAGE SCHEMAS
# ========================



class ConversationQueryRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None  # If provided, add to existing conversation

class ConversationQueryResponse(BaseModel):
    session_id: str  # For SSE streaming
    conversation_id: str
    user_message_id: str  # The user message just created
    stream_url: str
    is_new_conversation: bool
    connection_locked: bool  # True if connection just got locked

# UI Response Types - These are sent via SSE to the frontend
class SQLResponse(BaseModel):
    sql: str
    is_valid: bool
    error_message: Optional[str] = None

class DataResponse(BaseModel):
    data: List[Dict[str, Any]]
    row_count: int
    column_info: Optional[Dict[str, Any]] = None
    execution_time: Optional[int] = None  # milliseconds

class PlotResponse(BaseModel):
    chart_data: Dict[str, Any]  # Plotly figure JSON
    chart_code: Optional[str] = None  # Generated Python code
    should_generate: bool = True
    error_message: Optional[str] = None

class SummaryResponse(BaseModel):
    summary: str
    key_insights: Optional[List[str]] = None
    followup_questions: Optional[List[str]] = None

# Complete query result (stored in assistant message)
class QueryResult(BaseModel):
    question: str
    sql_response: Optional[SQLResponse] = None
    data_response: Optional[DataResponse] = None
    plot_response: Optional[PlotResponse] = None
    summary_response: Optional[SummaryResponse] = None
    error_message: Optional[str] = None
    processing_time: Optional[int] = None  # Total processing time in ms

class MessageResponse(BaseModel):
    id: str
    conversation_id: str              # ✅ ADD THIS - it was missing
    content: str
    message_type: MessageType
    
    # Query result data (for assistant messages)
    generated_sql: Optional[str] = None
    query_results: Optional[Dict[str, Any]] = None
    chart_data: Optional[Dict[str, Any]] = None
    summary: Optional[str] = None
    
    # Metadata
    execution_time: Optional[int] = None
    row_count: Optional[int] = None
    tokens_used: Optional[int] = None
    model_used: Optional[str] = None
    is_edited: bool
    is_deleted: bool = False          # ✅ ADD THIS - it was missing
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        
class MessageCreate(BaseModel):
    conversation_id: str
    content: str
    message_type: MessageType = MessageType.USER
    generated_sql: Optional[str] = None
    query_results: Optional[Dict[str, Any]] = None
    chart_data: Optional[Dict[str, Any]] = None
    summary: Optional[str] = None
    execution_time: Optional[int] = None
    row_count: Optional[int] = None
    tokens_used: Optional[int] = None
    model_used: Optional[str] = None
    is_deleted: bool = False  # ✅ ADD THIS

class ConversationCreate(BaseModel):
    connection_id: str
    title: Optional[str] = None  # Auto-generated if not provided
    description: Optional[str] = None

class ConversationUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    connection_id: Optional[str] = None  # Can only change if connection_locked=False
    is_pinned: Optional[bool] = None

class ConversationResponse(BaseModel):
    id: str
    connection_id: str
    connection_name: str
    title: str
    description: Optional[str] = None
    is_active: bool
    is_pinned: bool
    connection_locked: bool  # Whether connection can be changed
    message_count: int
    total_queries: int
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    latest_message: Optional[str] = None

    class Config:
        from_attributes = True

class ConversationWithMessagesResponse(BaseModel):
    id: str
    connection_id: str
    connection_name: str
    title: str
    description: Optional[str] = None
    is_active: bool
    is_pinned: bool
    connection_locked: bool
    message_count: int
    total_queries: int
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    messages: List[MessageResponse]

    class Config:
        from_attributes = True

class ConversationListResponse(BaseModel):
    conversations: List[ConversationResponse]
    total: int
    page: int = 1
    per_page: int = 20
    total_pages: int

class SuggestedQuestionsResponse(BaseModel):
    questions: List[str]
    connection_id: str
    conversation_id: Optional[str] = None
    total: int


# ========================
# CONNECTION SCHEMA DISCOVERY
# ========================

class SchemaRefreshRequest(BaseModel):
    connection_id: str = Field(..., description="Connection UUID to refresh schema")

class SchemaRefreshResponse(BaseModel):
    """Response for schema refresh operation"""
    task_id: str
    connection_id: str
    status: str
    stream_url: str
    message: str = "Schema refresh started"

class ConnectionSchemaResponse(BaseModel):
    """Response for connection schema"""
    connection_id: str
    connection_name: str
    schema: Dict[str, Any]
    last_refreshed: Optional[str]
    total_tables: int
    total_columns: int


# ========================
# COLUMN INFORMATION SCHEMAS
# ========================

class ColumnInfo(BaseModel):
    """Column information with all details"""
    column_name: str
    data_type: str
    variable_range: str = ""
    description: str = ""
    has_description: bool = False
    categories: Optional[List[str]] = None
    range: Optional[Dict[str, float]] = None
    date_range: Optional[Dict[str, str]] = None

class ColumnDescriptionsResponse(BaseModel):
    """Response for column descriptions"""
    connection_id: str
    connection_name: str
    column_descriptions: List[ColumnInfo]
    total_columns: int
    has_descriptions: bool

class UpdateColumnDescriptionsResponse(BaseModel):
    """Response for updating column descriptions"""
    success: bool
    message: str
    connection_id: str
    total_columns: int

class ColumnDescriptionUpload(BaseModel):
    """Schema for uploading column descriptions via CSV"""
    column: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=1000)

class ColumnDescriptionItem(BaseModel):
    """Schema for individual column description items"""
    column_name: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=1000)

# ========================
# CONNECTION MANAGEMENT
# ========================

class ConnectionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    server: Optional[str] = Field(None, min_length=1)
    database_name: Optional[str] = Field(None, min_length=1)
    username: Optional[str] = Field(None, min_length=1)
    password: Optional[str] = Field(None, min_length=1)
    driver: Optional[str] = None
    encrypt: Optional[bool] = None
    trust_server_certificate: Optional[bool] = None


# ========================
# TASK SCHEMAS
# ========================

class TaskResponse(BaseModel):
    task_id: str
    connection_id: Optional[str] = None
    task_type: TaskType
    status: TaskStatus
    progress: int
    stream_url: str
    created_at: datetime


    class Config:
        from_attributes = True

class TaskStatusResponse(BaseModel):
    task_id: str
    status: TaskStatus
    progress: int
    error_message: Optional[str] = None
    completed_at: Optional[datetime] = None


# ========================
# ANALYTICS SCHEMAS
# ========================

class UserStatsResponse(BaseModel):
    user_id: str
    total_connections: int
    total_conversations: int
    total_messages: int
    total_queries: int
    active_conversations: int
    last_activity: Optional[datetime] = None

class ConversationStatsResponse(BaseModel):
    total_conversations: int
    active_conversations: int
    pinned_conversations: int
    total_messages: int
    total_queries: int
    avg_messages_per_conversation: float


# ========================
# UTILITY SCHEMAS
# ========================

class ErrorResponse(BaseModel):
    detail: str
    error_code: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ValidationErrorResponse(BaseModel):
    detail: List[Dict[str, Any]]
    error_code: str = "validation_error"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# NEW: Model-related enums and schemas

class ModelStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    TRAINING = "training"
    TRAINED = "trained"
    TRAINING_FAILED = "training_failed"

# Model Base Schemas
class ModelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

class ModelCreate(ModelBase):
    connection_id: uuid.UUID

class ModelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[ModelStatus] = None

class ModelResponse(ModelBase):
    id: uuid.UUID
    connection_id: uuid.UUID
    user_id: uuid.UUID
    status: ModelStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Model Tracked Table Schemas
class ModelTrackedTableBase(BaseModel):
    table_name: str = Field(..., min_length=1, max_length=255)
    schema_name: Optional[str] = Field(None, max_length=255)
    is_active: bool = True

class ModelTrackedTableCreate(ModelTrackedTableBase):
    pass

class ModelTrackedTableUpdate(BaseModel):
    table_name: Optional[str] = Field(None, min_length=1, max_length=255)
    schema_name: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None

class ModelTrackedTableResponse(ModelTrackedTableBase):
    id: uuid.UUID
    model_id: uuid.UUID
    created_at: datetime
    
    class Config:
        from_attributes = True

# Model Tracked Column Schemas
class ModelTrackedColumnBase(BaseModel):
    column_name: str = Field(..., min_length=1, max_length=255)
    is_tracked: bool = True
    description: Optional[str] = None

class ModelTrackedColumnCreate(ModelTrackedColumnBase):
    pass

class ModelTrackedColumnUpdate(BaseModel):
    column_name: Optional[str] = Field(None, min_length=1, max_length=255)
    is_tracked: Optional[bool] = None
    description: Optional[str] = None

class ModelTrackedColumnResponse(ModelTrackedColumnBase):
    id: uuid.UUID
    model_tracked_table_id: uuid.UUID
    created_at: datetime
    
    class Config:
        from_attributes = True

# Model Training Documentation Schemas
class ModelTrainingDocumentationBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    doc_type: str = Field(..., min_length=1, max_length=100)
    content: str
    category: Optional[str] = Field(None, max_length=100)
    order_index: int = 0

class ModelTrainingDocumentationCreate(ModelTrainingDocumentationBase):
    pass

class ModelTrainingDocumentationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    doc_type: Optional[str] = Field(None, min_length=1, max_length=100)
    content: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
    order_index: Optional[int] = None

class ModelTrainingDocumentationResponse(ModelTrainingDocumentationBase):
    id: uuid.UUID
    model_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Model Training Question Schemas
class ModelTrainingQuestionBase(BaseModel):
    question: str
    sql: str
    validation_notes: Optional[str] = None

class ModelTrainingQuestionCreate(ModelTrainingQuestionBase):
    pass

class ModelTrainingQuestionUpdate(BaseModel):
    question: Optional[str] = None
    sql: Optional[str] = None
    validation_notes: Optional[str] = None

class ModelTrainingQuestionResponse(ModelTrainingQuestionBase):
    id: uuid.UUID
    model_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Model Training Column Schemas
class ModelTrainingColumnBase(BaseModel):
    table_name: str = Field(..., min_length=1, max_length=255)
    column_name: str = Field(..., min_length=1, max_length=255)
    data_type: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    value_range: Optional[str] = None
    description_source: str = Field(default="manual", max_length=50)
    is_active: bool = True

class ModelTrainingColumnCreate(ModelTrainingColumnBase):
    pass

class ModelTrainingColumnUpdate(BaseModel):
    table_name: Optional[str] = Field(None, min_length=1, max_length=255)
    column_name: Optional[str] = Field(None, min_length=1, max_length=255)
    data_type: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    value_range: Optional[str] = None
    description_source: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None

class ModelTrainingColumnResponse(ModelTrainingColumnBase):
    id: uuid.UUID
    model_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Comprehensive Model Response with Relationships
class ModelDetailResponse(ModelResponse):
    tracked_tables: List[ModelTrackedTableResponse] = []
    training_documentation: List[ModelTrainingDocumentationResponse] = []
    training_questions: List[ModelTrainingQuestionResponse] = []
    training_columns: List[ModelTrainingColumnResponse] = []
    
    class Config:
        from_attributes = True

# Model List Response
class ModelListResponse(BaseModel):
    models: List[ModelResponse]
    total: int
    page: int
    per_page: int
    total_pages: int

# Model Creation Response
class ModelCreationResponse(BaseModel):
    model: ModelResponse
    message: str = "Model created successfully"

# Model Training Schemas
class ModelTrainingRequest(BaseModel):
    model_id: uuid.UUID

class ModelTrainingResponse(BaseModel):
    task_id: uuid.UUID
    status: str
    message: str

# Model Query Schemas
class ModelQueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)

class ModelQueryResponse(BaseModel):
    question: str
    sql: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None

# Model Schema Discovery Schemas
class SchemaDiscoveryRequest(BaseModel):
    model_id: uuid.UUID

class SchemaDiscoveryResponse(BaseModel):
    tables: List[Dict[str, Any]]
    message: str

# Model Status Update Schemas
class ModelStatusUpdateRequest(BaseModel):
    status: ModelStatus

class ModelStatusUpdateResponse(BaseModel):
    model: ModelResponse
    message: str