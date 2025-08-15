"""Add enhanced training question fields

Revision ID: add_enhanced_training_fields
Revises: add_model_tables
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_enhanced_training_fields'
down_revision = 'add_model_tables'
branch_labels = None
depends_on = None


def upgrade():
    # Add new fields to model_training_questions table
    op.add_column('model_training_questions', sa.Column('involved_columns', postgresql.JSONB(), nullable=True))
    op.add_column('model_training_questions', sa.Column('query_type', sa.String(length=100), nullable=True))
    op.add_column('model_training_questions', sa.Column('difficulty', sa.String(length=50), nullable=True))
    op.add_column('model_training_questions', sa.Column('generated_by', sa.String(length=50), nullable=True, server_default='manual'))
    op.add_column('model_training_questions', sa.Column('is_validated', sa.Boolean(), nullable=True, server_default='false'))


def downgrade():
    # Remove the added columns
    op.drop_column('model_training_questions', 'is_validated')
    op.drop_column('model_training_questions', 'generated_by')
    op.drop_column('model_training_questions', 'difficulty')
    op.drop_column('model_training_questions', 'query_type')
    op.drop_column('model_training_questions', 'involved_columns')
