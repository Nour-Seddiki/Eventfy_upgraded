"""Add image column to events table.

Revision ID: 20260409_add_event_image
Revises: None
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "20260409_add_event_image"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("events")}
    if "image" not in columns:
        with op.batch_alter_table("events") as batch_op:
            batch_op.add_column(sa.Column("image", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("events")}
    if "image" in columns:
        with op.batch_alter_table("events") as batch_op:
            batch_op.drop_column("image")
