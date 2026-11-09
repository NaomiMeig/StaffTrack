"""create employees table

Revision ID: dc8fe555a2df
Revises:
Create Date: 2026-10-13 23:29:59.917571

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "dc8fe555a2df"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("matricule", sa.String(length=30), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("department", sa.String(length=100), nullable=True),
        sa.Column("job_title", sa.String(length=100), nullable=True),
        sa.Column("hire_date", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_employees_id",
        "employees",
        ["id"],
        unique=False,
    )

    op.create_index(
        "ix_employees_matricule",
        "employees",
        ["matricule"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_employees_matricule", table_name="employees")
    op.drop_index("ix_employees_id", table_name="employees")
    op.drop_table("employees")
