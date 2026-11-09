
from datetime import date, datetime, time
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


def clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def clean_required_reason(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Le motif est obligatoire.")
    return value


class AttendanceCreate(BaseModel):
    employee_id: int = Field(gt=0)
    attendance_date: date
    check_in: time | None = None
    check_out: time | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @model_validator(mode="after")
    def validate_times(self):
        if (
            self.check_in is not None
            and self.check_out is not None
            and self.check_out <= self.check_in
        ):
            raise ValueError(
                "L'heure de départ doit être postérieure à l'heure d'arrivée."
            )
        return self


class AttendanceUpdate(BaseModel):
    check_in: time | None = None
    check_out: time | None = None
    notes: str | None = Field(default=None, max_length=500)
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str | None) -> str | None:
        return clean_optional_text(value)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        return clean_required_reason(value)

    @model_validator(mode="after")
    def validate_times(self):
        if (
            self.check_in is not None
            and self.check_out is not None
            and self.check_out <= self.check_in
        ):
            raise ValueError(
                "L'heure de départ doit être postérieure à l'heure d'arrivée."
            )
        return self


class AttendanceAbsenceCreate(BaseModel):
    employee_id: int = Field(gt=0)
    attendance_date: date
    absence_type: Literal["justifie", "injustifie"]
    absence_reason: str = Field(min_length=1, max_length=500)

    @field_validator("absence_reason")
    @classmethod
    def clean_absence_reason(cls, value: str) -> str:
        return clean_required_reason(value)


class AttendanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    attendance_date: date
    check_in: time | None
    check_out: time | None
    status: str
    notes: str | None
    absence_type: str | None = None
    absence_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class AttendanceCorrectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    attendance_id: int
    field_name: str
    old_value: str | None
    new_value: str | None
    reason: str
    author: str
    corrected_at: datetime


class AttendanceManualCreate(BaseModel):
    employee_id: int = Field(gt=0)
    attendance_date: date
    check_in: time
    check_out: time | None = None
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        return clean_required_reason(value)


class AttendanceAbsenceUpdate(BaseModel):
    absence_type: Literal["justifie", "injustifie"] | None = None
    absence_reason: str | None = Field(default=None, max_length=500)
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("absence_reason")
    @classmethod
    def clean_absence_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Le motif de l'absence est obligatoire.")
        return value

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        return clean_required_reason(value)

    @model_validator(mode="after")
    def validate_changes(self):
        if self.absence_type is None and self.absence_reason is None:
            raise ValueError("Aucune modification de l'absence fournie.")
        return self
