
from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import AttendanceCorrection, AttendanceRecord, Employee
from app.schemas.attendance import (
    AttendanceAbsenceCreate,
    AttendanceAbsenceUpdate,
    AttendanceCorrectionResponse,
    AttendanceCreate,
    AttendanceResponse,
    AttendanceUpdate,
    AttendanceManualCreate,
)

router = APIRouter(prefix="/attendance", tags=["Présences"])


class AttendanceCheckOut(BaseModel):
    check_out: time


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_attendance_or_404(
    db: Session,
    attendance_id: int,
) -> AttendanceRecord:
    record = db.get(AttendanceRecord, attendance_id)

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fiche de présence introuvable.",
        )

    return record


@router.get("/", response_model=list[AttendanceResponse])
def list_attendance(
    attendance_date: date | None = Query(default=None),
    employee_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
):
    query = select(AttendanceRecord)

    if attendance_date is not None:
        query = query.where(
            AttendanceRecord.attendance_date == attendance_date
        )

    if employee_id is not None:
        query = query.where(
            AttendanceRecord.employee_id == employee_id
        )

    query = query.order_by(
        AttendanceRecord.attendance_date.desc(),
        AttendanceRecord.employee_id.asc(),
    )

    return db.scalars(query).all()


@router.post(
    "/",
    response_model=AttendanceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_attendance(
    payload: AttendanceCreate,
    db: Session = Depends(get_db),
):
    employee = db.get(Employee, payload.employee_id)

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employé introuvable.",
        )

    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible d'enregistrer la présence d'un employé inactif.",
        )

    existing = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == payload.employee_id,
            AttendanceRecord.attendance_date == payload.attendance_date,
        )
    )

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une fiche de présence existe déjà pour cet employé à cette date.",
        )

    record = AttendanceRecord(
        employee_id=payload.employee_id,
        attendance_date=payload.attendance_date,
        check_in=payload.check_in,
        check_out=payload.check_out,
        notes=payload.notes,
        status=(
            "complete"
            if payload.check_in is not None
            and payload.check_out is not None
            else "incomplete"
        ),
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une fiche de présence existe déjà pour cet employé à cette date.",
        )

    return record


@router.post(
    "/manual",
    response_model=AttendanceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_manual_attendance(
    payload: AttendanceManualCreate,
    db: Session = Depends(get_db),
):
    """Saisie rétroactive avec historique des heures saisies."""

    if payload.attendance_date > date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Impossible de saisir une présence à une date future.",
        )

    employee = db.get(Employee, payload.employee_id)

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employé introuvable.",
        )

    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible d'enregistrer la présence d'un employé inactif.",
        )

    existing = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == payload.employee_id,
            AttendanceRecord.attendance_date == payload.attendance_date,
        )
    )

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une fiche de présence existe déjà pour cet employé à cette date.",
        )

    record = AttendanceRecord(
        employee_id=payload.employee_id,
        attendance_date=payload.attendance_date,
        check_in=payload.check_in,
        check_out=payload.check_out,
        status=(
            "complete"
            if payload.check_in is not None
            and payload.check_out is not None
            else "incomplete"
        ),
    )

    try:
        db.add(record)
        db.flush()

        entries = [("check_in", payload.check_in)]

        if payload.check_out is not None:
            entries.append(("check_out", payload.check_out))

        db.add_all(
            [
                AttendanceCorrection(
                    attendance_id=record.id,
                    field_name=field,
                    old_value=None,
                    new_value=str(value),
                    reason=payload.reason,
                    author="Responsable",
                )
                for field, value in entries
            ]
        )

        db.commit()
        db.refresh(record)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La saisie de la présence a échoué.",
        )

    return record


@router.post(
    "/absence",
    response_model=AttendanceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_absence(
    payload: AttendanceAbsenceCreate,
    db: Session = Depends(get_db),
):
    """Enregistrer une absence avec son motif et son historique."""

    if payload.attendance_date > date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Impossible d'enregistrer une absence à une date future.",
        )

    employee = db.get(Employee, payload.employee_id)

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employé introuvable.",
        )

    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible d'enregistrer l'absence d'un employé inactif.",
        )

    existing = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == payload.employee_id,
            AttendanceRecord.attendance_date == payload.attendance_date,
        )
    )

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Une fiche de présence ou d'absence existe déjà "
                "pour cet employé à cette date."
            ),
        )

    record = AttendanceRecord(
        employee_id=payload.employee_id,
        attendance_date=payload.attendance_date,
        check_in=None,
        check_out=None,
        status="absence",
        absence_type=payload.absence_type,
        absence_reason=payload.absence_reason,
    )

    try:
        db.add(record)
        db.flush()

        db.add_all(
            [
                AttendanceCorrection(
                    attendance_id=record.id,
                    field_name="absence_type",
                    old_value=None,
                    new_value=payload.absence_type,
                    reason=payload.absence_reason,
                    author="Responsable",
                ),
                AttendanceCorrection(
                    attendance_id=record.id,
                    field_name="absence_reason",
                    old_value=None,
                    new_value=payload.absence_reason,
                    reason=payload.absence_reason,
                    author="Responsable",
                ),
            ]
        )

        db.commit()
        db.refresh(record)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="L'enregistrement de l'absence a échoué.",
        )

    return record


@router.patch(
    "/absence/{attendance_id}",
    response_model=AttendanceResponse,
)
def update_absence(
    attendance_id: int,
    payload: AttendanceAbsenceUpdate,
    db: Session = Depends(get_db),
):
    """Corriger une absence en conservant l'historique."""

    record = get_attendance_or_404(db, attendance_id)

    if record.absence_type is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette fiche n'est pas une absence.",
        )

    changes = payload.model_dump(
        exclude_unset=True,
        exclude={"reason"},
    )
    reason = payload.reason

    corrections = []

    for field, new_value in changes.items():
        old_value = getattr(record, field)

        if old_value == new_value:
            continue

        corrections.append(
            AttendanceCorrection(
                attendance_id=record.id,
                field_name=field,
                old_value=(
                    str(old_value) if old_value is not None else None
                ),
                new_value=(
                    str(new_value) if new_value is not None else None
                ),
                reason=reason,
                author="Responsable",
            )
        )
        setattr(record, field, new_value)

    if not corrections:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Aucune modification réelle à enregistrer.",
        )

    try:
        db.add_all(corrections)
        db.commit()
        db.refresh(record)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La modification de l'absence a échoué.",
        )

    return record


@router.patch(
    "/{attendance_id}/check-out",
    response_model=AttendanceResponse,
)
def record_check_out(
    attendance_id: int,
    payload: AttendanceCheckOut,
    db: Session = Depends(get_db),
):
    """Enregistrer un départ normal sans créer une correction."""

    record = get_attendance_or_404(db, attendance_id)

    if record.check_in is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enregistrez d'abord l'heure d'arrivée.",
        )

    if record.check_out is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Une heure de départ est déjà enregistrée. "
                "Utilisez la correction pour la modifier."
            ),
        )

    if payload.check_out <= record.check_in:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="L'heure de départ doit être postérieure à l'heure d'arrivée.",
        )

    record.check_out = payload.check_out
    record.status = "complete"

    try:
        db.commit()
        db.refresh(record)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="L'enregistrement du départ a échoué.",
        )

    return record


@router.patch("/{attendance_id}", response_model=AttendanceResponse)
def update_attendance(
    attendance_id: int,
    payload: AttendanceUpdate,
    db: Session = Depends(get_db),
):
    """Corriger une présence en conservant l'historique des changements."""

    record = get_attendance_or_404(db, attendance_id)

    if record.absence_type is not None:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cette fiche est une absence. "
                "Sa modification doit passer par la gestion des absences."
            ),
        )

    changes = payload.model_dump(
        exclude_unset=True,
        exclude={"reason"},
    )
    reason = payload.reason

    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Aucune modification fournie.",
        )

    if "check_in" in changes and changes["check_in"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="L'heure d'arrivée ne peut pas être supprimée.",
        )

    new_check_in = changes.get("check_in", record.check_in)
    new_check_out = changes.get("check_out", record.check_out)

    if (
        new_check_in is not None
        and new_check_out is not None
        and new_check_out <= new_check_in
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="L'heure de départ doit être postérieure à l'heure d'arrivée.",
        )

    corrections = []

    for field, new_value in changes.items():
        old_value = getattr(record, field)

        if old_value == new_value:
            continue

        correction = AttendanceCorrection(
            attendance_id=record.id,
            field_name=field,
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            reason=reason,
            author="Responsable",
        )

        corrections.append(correction)
        setattr(record, field, new_value)

    # Aucun changement réel : réponse normale, sans entrée d'historique.
    if not corrections:
        return record

    record.status = (
        "complete"
        if record.check_in is not None and record.check_out is not None
        else "incomplete"
    )

    try:
        db.add_all(corrections)
        db.commit()
        db.refresh(record)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La modification de la présence a échoué.",
        )

    return record


@router.get(
    "/{attendance_id}/corrections",
    response_model=list[AttendanceCorrectionResponse],
)
def list_attendance_corrections(
    attendance_id: int,
    db: Session = Depends(get_db),
):
    get_attendance_or_404(db, attendance_id)

    query = (
        select(AttendanceCorrection)
        .where(AttendanceCorrection.attendance_id == attendance_id)
        .order_by(
            AttendanceCorrection.corrected_at.desc(),
            AttendanceCorrection.id.desc(),
        )
    )

    return db.scalars(query).all()


@router.get("/report")
def get_attendance_report(
    date_from: date = Query(..., description="Date de début"),
    date_to: date = Query(..., description="Date de fin"),
    db: Session = Depends(get_db),
):
    """Rapport enrichi des présences et des absences sur une période."""

    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La date de début doit être antérieure ou égale à la date de fin.",
        )

    corrections_count = func.count(AttendanceCorrection.id).label(
        "corrections_count"
    )

    query = (
        select(AttendanceRecord, Employee, corrections_count)
        .join(Employee, Employee.id == AttendanceRecord.employee_id)
        .outerjoin(
            AttendanceCorrection,
            AttendanceCorrection.attendance_id == AttendanceRecord.id,
        )
        .where(
            AttendanceRecord.attendance_date >= date_from,
            AttendanceRecord.attendance_date <= date_to,
        )
        .group_by(AttendanceRecord.id, Employee.id)
        .order_by(
            AttendanceRecord.attendance_date.desc(),
            Employee.last_name.asc(),
            Employee.first_name.asc(),
        )
    )

    results = db.execute(query).all()
    report = []

    for record, employee, count in results:
        worked_minutes = None

        if (
            record.absence_type is None
            and record.check_in is not None
            and record.check_out is not None
        ):
            arrival_minutes = (
                record.check_in.hour * 60
                + record.check_in.minute
            )
            departure_minutes = (
                record.check_out.hour * 60
                + record.check_out.minute
            )

            # Règle StaffTrack : déduire 60 minutes de pause.
            worked_minutes = max(
                0,
                departure_minutes - arrival_minutes - 60,
            )

        report.append(
            {
                "id": record.id,
                "employee_id": employee.id,
                "matricule": employee.matricule,
                "first_name": employee.first_name,
                "last_name": employee.last_name,
                "department": employee.department,
                "is_active": employee.is_active,
                "attendance_date": record.attendance_date,
                "check_in": record.check_in,
                "check_out": record.check_out,
                "status": record.status,
                "notes": record.notes,
                "absence_type": record.absence_type,
                "absence_reason": record.absence_reason,
                "worked_minutes": worked_minutes,
                "corrections_count": count,
            }
        )

    return report


@router.get("/corrections")
def get_attendance_corrections_report(
    date_from: date = Query(..., description="Date de début"),
    date_to: date = Query(..., description="Date de fin"),
    db: Session = Depends(get_db),
):
    """Journal global des corrections, filtré par jour concerné."""

    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La date de début doit être antérieure ou égale à la date de fin.",
        )

    query = (
        select(AttendanceCorrection, AttendanceRecord, Employee)
        .join(
            AttendanceRecord,
            AttendanceRecord.id == AttendanceCorrection.attendance_id,
        )
        .join(Employee, Employee.id == AttendanceRecord.employee_id)
        .where(
            AttendanceRecord.attendance_date >= date_from,
            AttendanceRecord.attendance_date <= date_to,
        )
        .order_by(
            AttendanceCorrection.corrected_at.desc(),
            AttendanceCorrection.id.desc(),
        )
    )

    results = db.execute(query).all()

    return [
        {
            "id": correction.id,
            "attendance_id": record.id,
            "employee_id": employee.id,
            "matricule": employee.matricule,
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "department": employee.department,
            "is_active": employee.is_active,
            "attendance_date": record.attendance_date,
            "field_name": correction.field_name,
            "old_value": correction.old_value,
            "new_value": correction.new_value,
            "reason": correction.reason,
            "author": correction.author,
            "corrected_at": correction.corrected_at,
        }
        for correction, record, employee in results
    ]
