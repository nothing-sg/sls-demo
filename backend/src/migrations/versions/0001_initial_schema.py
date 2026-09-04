"""initial schema: patients, providers, appointments, audit_log

Revision ID: 0001
Revises:
Create Date: 2026-09-04
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "patients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("mrn", sa.String(32), nullable=False, unique=True),
        sa.Column("first_name", sa.String(128), nullable=False),
        sa.Column("last_name", sa.String(128), nullable=False),
        sa.Column("date_of_birth", sa.Date, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_patients_mrn", "patients", ["mrn"])

    op.create_table(
        "providers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("first_name", sa.String(128), nullable=False),
        sa.Column("last_name", sa.String(128), nullable=False),
        sa.Column("specialty", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "appointments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="scheduled"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.ForeignKeyConstraint(["provider_id"], ["providers.id"]),
    )
    op.create_index("ix_appointments_patient_id", "appointments", ["patient_id"])
    op.create_index("ix_appointments_provider_id", "appointments", ["provider_id"])

    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actor_subject", sa.String(128), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("resource_type", sa.String(64), nullable=False),
        sa.Column("resource_id", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(256), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("appointments")
    op.drop_table("providers")
    op.drop_table("patients")
