from sqlalchemy import Column, String, DateTime, Text, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB, ENUM
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from enum import Enum
import uuid

Base = declarative_base()

# Create PostgreSQL ENUMs
connection_status_enum = ENUM(
    'testing', 'test_success', 'test_failed', 
    'generating_data', 'data_generated', 
    'training', 'trained', 'training_failed',
    name='connection_status'
)

task_status_enum = ENUM(
    'pending', 'running', 'completed', 'failed',
    name='task_status'
)

task_type_enum = ENUM(
    'test_connection', 'generate_data', 'train_model', 'query', 'refresh_schema', 'generate_column_descriptions',
    name='task_type'
)

user_role_enum = ENUM(
    'user', 'admin', 'super_admin',
    name='user_role'
)

message_type_enum = ENUM(
    'user', 'assistant', 'system',
    name='message_type'
)

# NEW: Model-related ENUMs
model_status_enum = ENUM(
    'draft', 'active', 'archived', 'training', 'trained', 'training_failed',
    name='model_status'
)

# NEW: ModelStatus class for compatibility
class ModelStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    TRAINING = "training"
    TRAINED = "trained"
    TRAINING_FAILED = "training_failed"

from app.models.schemas import ConnectionStatus

# NEW: Conversation Management
class Conversation(Base):
    __tablename__ = "conversations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    connection_id = Column(UUID(as_uuid=True), ForeignKey("connections.id"), nullable=False, index=True)
    
    # Conversation metadata
    title = Column(String(500), nullable=False)  # Auto-generated or user-set
    description = Column(Text, nullable=True)
    
    # Status and settings
    is_active = Column(Boolean, default=True)
    is_pinned = Column(Boolean, default=False)
    connection_locked = Column(Boolean, default=False)  # NEW: True after first user message
    
    # Analytics
    message_count = Column(Integer, default=0)
    total_queries = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_message_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="conversations")
    connection = relationship("Connection", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")

# NEW: User Management
class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, unique=True, index=True)
    username = Column(String(100), nullable=False, unique=True, index=True)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    
    # User status and role
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    role = Column(user_role_enum, default='user')
    
    # Profile information
    profile_picture_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    company = Column(String(255), nullable=True)
    job_title = Column(String(255), nullable=True)
    
    # Settings
    preferences = Column(JSONB, default=dict)  # User preferences as JSON
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True))
    email_verified_at = Column(DateTime(timezone=True))
    
    # Relationships
    connections = relationship("Connection", back_populates="user", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
    models = relationship("Model", back_populates="user", cascade="all, delete-orphan")


# NEW: Message Management
class Message(Base):
    __tablename__ = "messages"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False, index=True)
    
    # Message content
    content = Column(Text, nullable=False)  # The actual message text
    message_type = Column(message_type_enum, nullable=False)  # user, assistant, system
    
    # Query-specific data (for assistant messages)
    generated_sql = Column(Text, nullable=True)  # SQL generated for this query
    query_results = Column(JSONB, nullable=True)  # Results data
    chart_data = Column(JSONB, nullable=True)  # Chart configuration
    summary = Column(Text, nullable=True)  # ✅ ADD THIS LINE
    execution_time = Column(Integer, nullable=True)  # Query execution time in ms
    row_count = Column(Integer, nullable=True)  # Number of rows returned
    
    # Message metadata
    tokens_used = Column(Integer, nullable=True)  # Tokens consumed by LLM
    model_used = Column(String(100), nullable=True)  # Which model was used
    
    # Status
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    conversation = relationship("Conversation", back_populates="messages")


# UPDATED: Connection (now belongs to a user)
class Connection(Base):
    __tablename__ = "connections"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)  # NEW: User ownership
    
    name = Column(String(255), nullable=False)  # Remove unique constraint since it's now per-user
    server = Column(String(255), nullable=False)
    database_name = Column(String(255), nullable=False)
    username = Column(String(255), nullable=False)
    password = Column(Text, nullable=False)  # Will be encrypted
    driver = Column(String(200), nullable=True)
    encrypt = Column(Boolean, default=False)  # NEW: Encrypt connection
    trust_server_certificate = Column(Boolean, default=True)  # NEW: Trust server certificate
    
    status = Column(connection_status_enum, default=ConnectionStatus.TESTING)
    
    # Test connection results
    test_successful = Column(Boolean, default=False)
    test_error_message = Column(Text)
    sample_data = Column(JSONB)
    
    # Database-level fields (NEW)
    database_schema = Column(JSONB)  # Store discovered schema
    last_schema_refresh = Column(DateTime(timezone=True))
    
    # Usage analytics
    total_queries = Column(Integer, default=0)
    last_queried_at = Column(DateTime(timezone=True))
    
    # Sharing settings (for future multi-user features)
    is_shared = Column(Boolean, default=False)
    shared_with_users = Column(JSONB, default=list)  # List of user IDs
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="connections")
    conversations = relationship("Conversation", back_populates="connection", cascade="all, delete-orphan")
    models = relationship("Model", back_populates="connection", cascade="all, delete-orphan")
    
    # Add composite unique constraint for user_id + name
    __table_args__ = (
        {"schema": None},  # Explicit schema
    )


class TrainingTask(Base):
    __tablename__ = "training_tasks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connection_id = Column(UUID(as_uuid=True), ForeignKey("connections.id"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)  # NEW: Track user
    task_type = Column(task_type_enum, nullable=False)
    status = Column(task_status_enum, default='pending')
    progress = Column(Integer, default=0)
    logs = Column(Text)
    error_message = Column(Text)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# NEW: User Sessions (for JWT token management)
class UserSession(Base):
    __tablename__ = "user_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # Session data
    token_jti = Column(String(255), nullable=False, unique=True)  # JWT ID for token invalidation
    refresh_token = Column(String(500), nullable=True)
    
    # Session metadata
    ip_address = Column(String(45), nullable=True)  # IPv6 support
    user_agent = Column(Text, nullable=True)
    device_info = Column(JSONB, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_used_at = Column(DateTime(timezone=True), server_default=func.now())


# NEW: Email Verification Tokens
class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    token = Column(String(255), nullable=False, unique=True)
    is_used = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)


# NEW: Password Reset Tokens
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    token = Column(String(255), nullable=False, unique=True)
    is_used = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)

# NEW: Model-related tables
class Model(Base):
    __tablename__ = "models"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connection_id = Column(UUID(as_uuid=True), ForeignKey("connections.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(model_status_enum, default='draft')
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    connection = relationship("Connection", back_populates="models")
    user = relationship("User", back_populates="models")
    tracked_tables = relationship("ModelTrackedTable", back_populates="model", cascade="all, delete-orphan")
    training_documentation = relationship("ModelTrainingDocumentation", back_populates="model", cascade="all, delete-orphan")
    training_questions = relationship("ModelTrainingQuestion", back_populates="model", cascade="all, delete-orphan")
    training_columns = relationship("ModelTrainingColumn", back_populates="model", cascade="all, delete-orphan")


class ModelTrackedTable(Base):
    __tablename__ = "model_tracked_tables"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("models.id"), nullable=False, index=True)
    
    table_name = Column(String(255), nullable=False)
    schema_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    model = relationship("Model", back_populates="tracked_tables")
    tracked_columns = relationship("ModelTrackedColumn", back_populates="tracked_table", cascade="all, delete-orphan")


class ModelTrackedColumn(Base):
    __tablename__ = "model_tracked_columns"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_tracked_table_id = Column(UUID(as_uuid=True), ForeignKey("model_tracked_tables.id"), nullable=False, index=True)
    
    column_name = Column(String(255), nullable=False)
    is_tracked = Column(Boolean, default=True)
    description = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    tracked_table = relationship("ModelTrackedTable", back_populates="tracked_columns")


class ModelTrainingDocumentation(Base):
    __tablename__ = "model_training_documentation"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("models.id"), nullable=False, index=True)
    
    title = Column(String(255), nullable=False)
    doc_type = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String(100), nullable=True)
    order_index = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    model = relationship("Model", back_populates="training_documentation")


class ModelTrainingQuestion(Base):
    __tablename__ = "model_training_questions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("models.id"), nullable=False, index=True)
    
    question = Column(Text, nullable=False)
    sql = Column(Text, nullable=False)
    involved_columns = Column(JSONB, nullable=True)  # [{"table": "t1", "column": "c1"}]
    query_type = Column(String(100), nullable=True)  # simple_select, join, aggregation, etc.
    difficulty = Column(String(50), nullable=True)  # easy, medium, hard
    generated_by = Column(String(50), default='manual')  # ai, manual
    is_validated = Column(Boolean, default=False)
    validation_notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    model = relationship("Model", back_populates="training_questions")


class ModelTrainingColumn(Base):
    __tablename__ = "model_training_columns"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("models.id"), nullable=False, index=True)
    
    table_name = Column(String(255), nullable=False)
    column_name = Column(String(255), nullable=False)
    data_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    value_range = Column(Text, nullable=True)
    description_source = Column(String(50), default='manual')
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    model = relationship("Model", back_populates="training_columns")