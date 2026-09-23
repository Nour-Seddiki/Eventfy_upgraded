"""Add notification model

Revision ID: add_notification_table
Revises: 20260409_add_event_image
Create Date: 2026-04-10 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_notification_table'
down_revision = '20260409_add_event_image'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create notifications table
    op.create_table('notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('read', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('related_object_id', sa.Integer(), nullable=True),
        sa.Column('related_object_type', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_notifications_id', 'id'),
        sa.Index('ix_notifications_user_id', 'user_id')
    )


def downgrade() -> None:
    op.drop_table('notifications')
