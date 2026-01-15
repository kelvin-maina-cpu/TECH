"""initial migration

Revision ID: 0001_initial
Revises: 
Create Date: 2026-01-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'users',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('username', sa.String(150), nullable=False, unique=True),
        sa.Column('admission', sa.String(100), nullable=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('unlocked_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completed_projects', sa.JSON(), nullable=True),
        sa.Column('task_completion', sa.JSON(), nullable=True),
        sa.Column('points', sa.Integer(), nullable=False, server_default='0')
    )


def downgrade():
    op.drop_table('users')
