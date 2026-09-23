"""Change related_object_id column type from Integer to String for UUID support

Revision ID: 20260415_change_related_object_id_to_string
Revises: 20260410_add_review_table
Create Date: 2026-04-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260415_change_related_object_id_to_string'
down_revision = '20260410_add_review_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Convert existing Integer values to String
    op.alter_column(
        'notifications',
        'related_object_id',
        existing_type=sa.Integer(),
        type_=sa.String(),
        existing_nullable=True,
        nullable=True
    )


def downgrade() -> None:
    # This is a destructive downgrade - we can't reliably convert back
    op.alter_column(
        'notifications',
        'related_object_id',
        existing_type=sa.String(),
        type_=sa.Integer(),
        existing_nullable=True,
        nullable=True,
        postgresql_using='related_object_id::integer'
    )
