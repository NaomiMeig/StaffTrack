
from app.models import AttendanceCorrection, AttendanceRecord


def create_employee(client, matricule="ST100", active=True):
    response = client.post(
        "/employees/",
        json={
            "matricule": matricule,
            "first_name": "Amina",
            "last_name": "Diallo",
            "department": "Administration",
            "job_title": "Assistante",
            "hire_date": "2026-01-01",
        },
    )
    assert response.status_code == 201, response.text

    employee_id = response.json()["id"]

    if not active:
        deactivate_response = client.patch(
            f"/employees/{employee_id}/deactivate"
        )
        assert deactivate_response.status_code == 200

    return employee_id


def test_create_attendance(client):
    employee_id = create_employee(client)

    response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-13",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
            "notes": "Test automatisé",
        },
    )

    assert response.status_code == 201, response.text

    data = response.json()
    assert data["employee_id"] == employee_id
    assert data["attendance_date"] == "2026-10-13"
    assert data["check_in"] == "08:00:00"
    assert data["check_out"] == "17:00:00"
    assert data["status"] == "complete"


def test_reject_unknown_employee(client):
    response = client.post(
        "/attendance/",
        json={
            "employee_id": 9999,
            "attendance_date": "2026-10-13",
            "check_in": "08:00:00",
        },
    )

    assert response.status_code == 404


def test_reject_inactive_employee(client):
    employee_id = create_employee(client, active=False)

    response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-13",
            "check_in": "08:00:00",
        },
    )

    assert response.status_code == 400


def test_reject_duplicate_attendance(client):
    employee_id = create_employee(client)

    payload = {
        "employee_id": employee_id,
        "attendance_date": "2026-10-13",
        "check_in": "08:00:00",
    }

    first_response = client.post("/attendance/", json=payload)
    second_response = client.post("/attendance/", json=payload)

    assert first_response.status_code == 201
    assert second_response.status_code == 409


def test_reject_departure_before_arrival(client):
    employee_id = create_employee(client)

    response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-13",
            "check_in": "17:00:00",
            "check_out": "08:00:00",
        },
    )

    assert response.status_code == 422


def test_reject_departure_equal_to_arrival(client):
    employee_id = create_employee(client)

    response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-13",
            "check_in": "08:00:00",
            "check_out": "08:00:00",
        },
    )

    assert response.status_code == 422


def test_list_attendance_by_date(client):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-13",
            "check_in": "08:00:00",
        },
    )
    assert create_response.status_code == 201, create_response.text

    response = client.get(
        "/attendance/",
        params={"attendance_date": "2026-10-13"},
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["employee_id"] == employee_id


def test_complete_attendance_with_checkout_update(client):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-14",
            "check_in": "08:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]
    assert create_response.json()["status"] == "incomplete"

    update_response = client.patch(
        f"/attendance/{attendance_id}",
        json={
            "check_out": "17:00:00",
            "reason": "Correction de l'heure de départ",
        },
    )

    assert update_response.status_code == 200, update_response.text
    data = update_response.json()
    assert data["check_in"] == "08:00:00"
    assert data["check_out"] == "17:00:00"
    assert data["status"] == "complete"


def test_update_check_in_preserves_existing_checkout(client):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-14",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]

    update_response = client.patch(
        f"/attendance/{attendance_id}",
        json={
            "check_in": "08:15:00",
            "reason": "Correction de l'heure d'arrivée",
        },
    )

    assert update_response.status_code == 200, update_response.text
    data = update_response.json()
    assert data["check_in"] == "08:15:00"
    assert data["check_out"] == "17:00:00"
    assert data["status"] == "complete"


def test_reject_update_with_checkout_before_checkin(client):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-14",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]

    update_response = client.patch(
        f"/attendance/{attendance_id}",
        json={
            "check_out": "07:30:00",
            "reason": "Tentative de correction invalide",
        },
    )

    assert update_response.status_code == 422


def test_update_attendance_records_correction(client, test_db):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-14",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]

    update_response = client.patch(
        f"/attendance/{attendance_id}",
        json={
            "check_in": "08:15:00",
            "reason": "Correction après vérification du registre papier",
        },
    )

    assert update_response.status_code == 200, update_response.text

    correction = (
        test_db.query(AttendanceCorrection)
        .filter_by(
            attendance_id=attendance_id,
            field_name="check_in",
        )
        .one()
    )

    assert correction.old_value == "08:00:00"
    assert correction.new_value == "08:15:00"
    assert (
        correction.reason
        == "Correction après vérification du registre papier"
    )
    assert correction.author == "Responsable"

    history_response = client.get(
        f"/attendance/{attendance_id}/corrections"
    )

    assert history_response.status_code == 200, history_response.text
    history = history_response.json()

    assert len(history) == 1
    assert history[0]["attendance_id"] == attendance_id
    assert history[0]["field_name"] == "check_in"
    assert history[0]["old_value"] == "08:00:00"
    assert history[0]["new_value"] == "08:15:00"
    assert (
        history[0]["reason"]
        == "Correction après vérification du registre papier"
    )
    assert history[0]["author"] == "Responsable"


def test_attendance_correction_history_is_empty(client):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-15",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]

    history_response = client.get(
        f"/attendance/{attendance_id}/corrections"
    )

    assert history_response.status_code == 200, history_response.text
    assert history_response.json() == []


def test_attendance_correction_history_multiple_corrections(client):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-16",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]

    first_update = client.patch(
        f"/attendance/{attendance_id}",
        json={
            "check_in": "08:15:00",
            "reason": "Première correction après vérification",
        },
    )
    assert first_update.status_code == 200, first_update.text

    second_update = client.patch(
        f"/attendance/{attendance_id}",
        json={
            "check_in": "08:30:00",
            "reason": "Deuxième correction après confirmation",
        },
    )
    assert second_update.status_code == 200, second_update.text

    history_response = client.get(
        f"/attendance/{attendance_id}/corrections"
    )

    assert history_response.status_code == 200, history_response.text
    history = history_response.json()

    assert len(history) == 2

    assert history[0]["field_name"] == "check_in"
    assert history[0]["old_value"] == "08:15:00"
    assert history[0]["new_value"] == "08:30:00"
    assert (
        history[0]["reason"]
        == "Deuxième correction après confirmation"
    )

    assert history[1]["field_name"] == "check_in"
    assert history[1]["old_value"] == "08:00:00"
    assert history[1]["new_value"] == "08:15:00"
    assert (
        history[1]["reason"]
        == "Première correction après vérification"
    )


def test_attendance_correction_history_not_found(client):
    response = client.get("/attendance/999999/corrections")
    assert response.status_code == 404


def test_update_attendance_rejects_missing_reason(client):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-17",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]

    response = client.patch(
        f"/attendance/{attendance_id}",
        json={"check_in": "08:15:00"},
    )

    assert response.status_code == 422


def test_update_attendance_rejects_blank_reason(client):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-18",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]

    response = client.patch(
        f"/attendance/{attendance_id}",
        json={
            "check_in": "08:15:00",
            "reason": "   ",
        },
    )

    assert response.status_code == 422


def test_rejected_attendance_update_does_not_create_correction(
    client,
    test_db,
):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-19",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]

    response = client.patch(
        f"/attendance/{attendance_id}",
        json={"check_in": "08:15:00"},
    )

    assert response.status_code == 422

    history_response = client.get(
        f"/attendance/{attendance_id}/corrections"
    )
    assert history_response.status_code == 200
    assert history_response.json() == []

    attendance = test_db.get(AttendanceRecord, attendance_id)
    assert attendance is not None
    assert str(attendance.check_in) == "08:00:00"


def test_update_attendance_without_real_change_creates_no_correction(
    client,
):
    employee_id = create_employee(client)

    create_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-20",
            "check_in": "08:00:00",
            "check_out": "17:00:00",
        },
    )

    assert create_response.status_code == 201, create_response.text
    attendance_id = create_response.json()["id"]

    response = client.patch(
        f"/attendance/{attendance_id}",
        json={
            "check_in": "08:00:00",
            "reason": "Vérification de l'heure déjà enregistrée",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["check_in"] == "08:00:00"

    history_response = client.get(
        f"/attendance/{attendance_id}/corrections"
    )
    assert history_response.status_code == 200
    assert history_response.json() == []


# Tests de l'enregistrement normal du départ


def test_record_check_out_success(client):
    employee_id = create_employee(client, matricule="ST900")

    attendance_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-21",
            "check_in": "08:00:00",
        },
    )

    assert attendance_response.status_code == 201, attendance_response.text
    attendance_id = attendance_response.json()["id"]

    response = client.patch(
        f"/attendance/{attendance_id}/check-out",
        json={"check_out": "17:00:00"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["check_out"] == "17:00:00"
    assert response.json()["status"] == "complete"

    history = client.get(
        f"/attendance/{attendance_id}/corrections"
    )
    assert history.status_code == 200
    assert history.json() == []


def test_record_check_out_without_check_in_returns_400(client):
    employee_id = create_employee(client, matricule="ST901")

    attendance_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-22",
        },
    )

    assert attendance_response.status_code == 201, attendance_response.text
    attendance_id = attendance_response.json()["id"]

    response = client.patch(
        f"/attendance/{attendance_id}/check-out",
        json={"check_out": "17:00:00"},
    )

    assert response.status_code == 400


def test_record_check_out_twice_returns_409(client):
    employee_id = create_employee(client, matricule="ST902")

    attendance_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-23",
            "check_in": "08:00:00",
        },
    )

    assert attendance_response.status_code == 201, attendance_response.text
    attendance_id = attendance_response.json()["id"]

    first_response = client.patch(
        f"/attendance/{attendance_id}/check-out",
        json={"check_out": "17:00:00"},
    )
    assert first_response.status_code == 200, first_response.text

    second_response = client.patch(
        f"/attendance/{attendance_id}/check-out",
        json={"check_out": "17:30:00"},
    )
    assert second_response.status_code == 409


def test_record_check_out_before_check_in_returns_422(client):
    employee_id = create_employee(client, matricule="ST903")

    attendance_response = client.post(
        "/attendance/",
        json={
            "employee_id": employee_id,
            "attendance_date": "2026-10-24",
            "check_in": "08:00:00",
        },
    )

    assert attendance_response.status_code == 201, attendance_response.text
    attendance_id = attendance_response.json()["id"]

    response = client.patch(
        f"/attendance/{attendance_id}/check-out",
        json={"check_out": "07:00:00"},
    )

    assert response.status_code == 422
