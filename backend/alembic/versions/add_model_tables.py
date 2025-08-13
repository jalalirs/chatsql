"""Add model-related tables

Revision ID: add_model_tables
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_model_tables'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Create model_status enum
    op.execute("CREATE TYPE model_status AS ENUM ('draft', 'active', 'archived', 'training', 'trained', 'training_failed')")
    
    # Update connections table - remove training fields and add database-level fields
    op.drop_column('connections', 'table_name')
    op.drop_column('connections', 'column_descriptions_uploaded')
    op.drop_column('connections', 'initial_prompt')
    op.drop_column('connections', 'column_info')
    op.drop_column('connections', 'generated_examples_count')
    op.drop_column('connections', 'trained_at')
    
    op.add_column('connections', sa.Column('database_schema', postgresql.JSONB(), nullable=True))
    op.add_column('connections', sa.Column('last_schema_refresh', sa.DateTime(timezone=True), nullable=True))
    
    # Drop old training tables (will be replaced by model-based tables)
    op.drop_table('column_descriptions')
    op.drop_table('training_examples')
    op.drop_table('training_documentation')
    op.drop_table('training_question_sql')
    op.drop_table('training_column_schema')
    
    # Create models table
    op.create_table('models',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('connection_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('draft', 'active', 'archived', 'training', 'trained', 'training_failed', name='model_status'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['connection_id'], ['connections.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_models_connection_id'), 'models', ['connection_id'], unique=False)
    op.create_index(op.f('ix_models_user_id'), 'models', ['user_id'], unique=False)
    
    # Create model_tracked_tables table
    op.create_table('model_tracked_tables',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('table_name', sa.String(length=255), nullable=False),
        sa.Column('schema_name', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['model_id'], ['models.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_model_tracked_tables_model_id'), 'model_tracked_tables', ['model_id'], unique=False)
    
    # Create model_tracked_columns table
    op.create_table('model_tracked_columns',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('model_tracked_table_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('column_name', sa.String(length=255), nullable=False),
        sa.Column('is_tracked', sa.Boolean(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['model_tracked_table_id'], ['model_tracked_tables.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_model_tracked_columns_model_tracked_table_id'), 'model_tracked_columns', ['model_tracked_table_id'], unique=False)
    
    # Create model_training_documentation table
    op.create_table('model_training_documentation',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('doc_type', sa.String(length=100), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['model_id'], ['models.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_model_training_documentation_model_id'), 'model_training_documentation', ['model_id'], unique=False)
    
    # Create model_training_questions table
    op.create_table('model_training_questions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('sql', sa.Text(), nullable=False),
        sa.Column('validation_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['model_id'], ['models.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_model_training_questions_model_id'), 'model_training_questions', ['model_id'], unique=False)
    
    # Create model_training_columns table
    op.create_table('model_training_columns',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('table_name', sa.String(length=255), nullable=False),
        sa.Column('column_name', sa.String(length=255), nullable=False),
        sa.Column('data_type', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('value_range', sa.Text(), nullable=True),
        sa.Column('description_source', sa.String(length=50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['model_id'], ['models.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_model_training_columns_model_id'), 'model_training_columns', ['model_id'], unique=False)


def downgrade():
    # Drop tables in reverse order
    op.drop_index(op.f('ix_model_training_columns_model_id'), table_name='model_training_columns')
    op.drop_table('model_training_columns')
    
    op.drop_index(op.f('ix_model_training_questions_model_id'), table_name='model_training_questions')
    op.drop_table('model_training_questions')
    
    op.drop_index(op.f('ix_model_training_documentation_model_id'), table_name='model_training_documentation')
    op.drop_table('model_training_documentation')
    
    op.drop_index(op.f('ix_model_tracked_columns_model_tracked_table_id'), table_name='model_tracked_columns')
    op.drop_table('model_tracked_columns')
    
    op.drop_index(op.f('ix_model_tracked_tables_model_id'), table_name='model_tracked_tables')
    op.drop_table('model_tracked_tables')
    
    op.drop_index(op.f('ix_models_user_id'), table_name='models')
    op.drop_index(op.f('ix_models_connection_id'), table_name='models')
    op.drop_table('models')
    
    # Revert connections table changes
    op.drop_column('connections', 'database_schema')
    op.drop_column('connections', 'last_schema_refresh')
    
    op.add_column('connections', sa.Column('table_name', sa.String(length=255), nullable=True))
    op.add_column('connections', sa.Column('column_descriptions_uploaded', sa.Boolean(), nullable=True))
    op.add_column('connections', sa.Column('initial_prompt', sa.Text(), nullable=True))
    op.add_column('connections', sa.Column('column_info', postgresql.JSONB(), nullable=True))
    op.add_column('connections', sa.Column('generated_examples_count', sa.Integer(), nullable=True))
    op.add_column('connections', sa.Column('trained_at', sa.DateTime(timezone=True), nullable=True))
    
    # Recreate old training tables
    op.create_table('column_descriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('connection_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('column_name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('data_type', sa.String(length=100), nullable=True),
        sa.Column('variable_range', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['connection_id'], ['connections.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('training_examples',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('connection_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('sql', sa.Text(), nullable=False),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['connection_id'], ['connections.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('training_documentation',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('connection_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('doc_type', sa.String(length=100), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['connection_id'], ['connections.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('training_question_sql',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('connection_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('sql', sa.Text(), nullable=False),
        sa.Column('generated_by', sa.String(length=50), nullable=True),
        sa.Column('generation_model', sa.String(length=100), nullable=True),
        sa.Column('is_validated', sa.Boolean(), nullable=True),
        sa.Column('validation_notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['connection_id'], ['connections.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('training_column_schema',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('connection_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('column_name', sa.String(length=255), nullable=False),
        sa.Column('data_type', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('value_range', sa.Text(), nullable=True),
        sa.Column('description_source', sa.String(length=50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['connection_id'], ['connections.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Drop enum
    op.execute("DROP TYPE model_status")
