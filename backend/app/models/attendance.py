
from datetime import date, datetime, time

from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "attendance_date",
            name="uq_attendance_employee_date",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id"),
        nullable=False,
        index=True,
    )

    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)

    check_in: Mapped[time | None] = mapped_column(Time, nullable=True)
    check_out: Mapped[time | None] = mapped_column(Time, nullable=True)

    status: Mapped[str] = mapped_column(
        String(30),
        default="incomplete",
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    absence_type: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    absence_reason: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )


class AttendanceManualCreate(BaseModel):
    employee_id: int = Field(gt=0)
    attendance_date: date
    check_in: time
    check_out: time | None = None
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Le motif de saisie est obligatoire.")
        return value

    @model_validator(mode="after")
    def validate_times(self):
        if self.check_out is not None and self.check_out <= self.check_in:
            raise ValueError(
                "L'heure de départ doit être postérieure à l'heure d'arrivée."
            )
        return self