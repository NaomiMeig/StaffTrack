
def test_create_employee(client):
    response = client.post(
        "/employees/",
        json={
            "matricule": "TEST001",
            "first_name": "Awa",
            "last_name": "Diallo",
            "department": "Administration",
            "job_title": "Assistante",
            "hire_date": "2026-10-13",
        },
    )

    assert response.status_code == 201

    data = response.json()
    assert data["matricule"] == "TEST001"
    assert data["first_name"] == "Awa"
    assert data["last_name"] == "Diallo"
    assert data["is_active"] is True


def test_list_employees(client):
    client.post(
        "/employees/",
        json={
            "matricule": "TEST002",
            "first_name": "Mariam",
            "last_name": "Koné",
            "department": "Comptabilité",
            "job_title": "Comptable",
            "hire_date": "2026-10-13",
        },
    )

    response = client.get("/employees/")

    assert response.status_code == 200
    employees = response.json()
    assert len(employees) == 1
    assert employees[0]["matricule"] == "TEST002"


def test_duplicate_matricule_is_rejected(client):
    employee = {
        "matricule": "TEST003",
        "first_name": "Fatou",
        "last_name": "Traoré",
        "department": "RH",
        "job_title": "Assistante RH",
        "hire_date": "2026-10-13",
    }

    first_response = client.post("/employees/", json=employee)
    second_response = client.post("/employees/", json=employee)

    assert first_response.status_code == 201
    assert second_response.status_code == 409


def test_empty_first_name_is_rejected(client):
    response = client.post(
        "/employees/",
        json={
            "matricule": "TEST004",
            "first_name": "   ",
            "last_name": "Mensah",
            "department": "Administration",
            "job_title": "Assistante",
            "hire_date": "2026-10-13",
        },
    )

    assert response.status_code == 422


def test_deactivate_employee(client):
    response = client.post(
        "/employees/",
        json={
            "matricule": "TEST005",
            "first_name": "Nadia",
            "last_name": "Sow",
            "department": "RH",
            "job_title": "Gestionnaire",
            "hire_date": "2026-10-13",
        },
    )

    assert response.status_code == 201
    employee_id = response.json()["id"]

    deactivate_response = client.patch(
        f"/employees/{employee_id}/deactivate"
    )

    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["is_active"] is False

    detail_response = client.get(f"/employees/{employee_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["matricule"] == "TEST005"


def test_get_employee_not_found(client):
    response = client.get("/employees/999999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Employé introuvable."


def test_update_employee(client):
    create_response = client.post(
        "/employees/",
        json={
            "matricule": "TEST006",
            "first_name": "Aminata",
            "last_name": "Ba",
            "department": "RH",
            "job_title": "Assistante",
            "hire_date": "2026-10-13",
        },
    )

    assert create_response.status_code == 201
    employee_id = create_response.json()["id"]

    response = client.patch(
        f"/employees/{employee_id}",
        json={"department": "Informatique"},
    )

    assert response.status_code == 200
    assert response.json()["department"] == "Informatique"
    assert response.json()["first_name"] == "Aminata"


def test_update_employee_not_found(client):
    response = client.patch(
        "/employees/999999",
        json={"department": "Informatique"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Employé introuvable."


def test_deactivate_employee_not_found(client):
    response = client.patch("/employees/999999/deactivate")

    assert response.status_code == 404
    assert response.json()["detail"] == "Employé introuvable."


def test_list_employees_can_include_inactive(client):
    create_response = client.post(
        "/employees/",
        json={
            "matricule": "TEST007",
            "first_name": "Aïcha",
            "last_name": "Diallo",
            "department": "Administration",
            "job_title": "Assistante",
            "hire_date": "2026-10-13",
        },
    )

    assert create_response.status_code == 201
    employee_id = create_response.json()["id"]

    deactivate_response = client.patch(
        f"/employees/{employee_id}/deactivate"
    )
    assert deactivate_response.status_code == 200

    active_response = client.get("/employees/")
    assert active_response.status_code == 200
    assert all(
        employee["id"] != employee_id
        for employee in active_response.json()
    )

    all_response = client.get("/employees/?active_only=false")
    assert all_response.status_code == 200
    assert any(
        employee["id"] == employee_id and not employee["is_active"]
        for employee in all_response.json()
    )


def test_search_employees_by_name(client):
    create_response = client.post(
        "/employees/",
        json={
            "matricule": "TEST008",
            "first_name": "Mariama",
            "last_name": "Koné",
            "department": "Comptabilité",
            "job_title": "Comptable",
            "hire_date": "2026-10-13",
        },
    )

    assert create_response.status_code == 201

    response = client.get("/employees/?search=Mariama")

    assert response.status_code == 200
    assert any(
        employee["matricule"] == "TEST008"
        for employee in response.json()
    )


def test_empty_matricule_is_rejected(client):
    response = client.post(
        "/employees/",
        json={
            "matricule": "   ",
            "first_name": "Awa",
            "last_name": "Diallo",
            "department": "Administration",
            "job_title": "Assistante",
            "hire_date": "2026-10-13",
        },
    )

    assert response.status_code == 422


def test_empty_last_name_is_rejected(client):
    response = client.post(
        "/employees/",
        json={
            "matricule": "TEST009",
            "first_name": "Awa",
            "last_name": "   ",
            "department": "Administration",
            "job_title": "Assistante",
            "hire_date": "2026-10-13",
        },
    )

    assert response.status_code == 422
    id="c1j8as"
