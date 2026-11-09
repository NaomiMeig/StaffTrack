
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  UserRoundPlus,
  Users,
  SlidersHorizontal,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";

import "./Employees.css";
import EmployeeForm from "./EmployeeForm.jsx";
import EmployeeEditForm from "./EmployeeEditForm.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

const API_URL = "http://127.0.0.1:8000/employees/";

function Employees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Charger les employés depuis l'API
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}?active_only=false`);

      if (!response.ok) {
        throw new Error(
          `Erreur HTTP ${response.status}. Impossible de charger les employés.`,
        );
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Le format de réponse de l'API est inattendu.");
      }

      setEmployees(data);
    } catch (err) {
      console.error("Chargement des employés :", err);

      setError(
        err instanceof TypeError
          ? "Impossible de joindre l'API. Vérifiez que le backend fonctionne et que l'accès depuis le frontend est autorisé."
          : err.message || "Une erreur est survenue lors du chargement.",
      );

      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Après la création d'un employé
  const handleEmployeeCreated = async () => {
    setShowEmployeeForm(false);
    setSelectedEmployee(null);
    setSearch("");
    setStatusFilter("active");

    await loadEmployees();
  };

  // Ouvrir la fenêtre de confirmation
  const openConfirmDialog = (action) => {
    setNotification(null);
    setConfirmAction(action);
  };

  // Désactiver ou réactiver un employé après confirmation
  const handleEmployeeStatusChange = async () => {
    if (!selectedEmployee || !confirmAction || actionLoading) {
      return;
    }

    const isActivation = confirmAction === "activate";
    const actionUrl = isActivation ? "activate" : "deactivate";

    setActionLoading(true);
    setNotification(null);

    try {
      const response = await fetch(
        `${API_URL}${selectedEmployee.id}/${actionUrl}`,
        { method: "PATCH" },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail = data?.detail;

        throw new Error(
          typeof detail === "string"
            ? detail
            : `Impossible de ${isActivation ? "réactiver" : "désactiver"} cet employé.`,
        );
      }

      // Actualiser l'employé dans la liste
      setEmployees((previous) =>
        previous.map((employee) =>
          employee.id === data.id ? data : employee,
        ),
      );

      // Actualiser la fiche actuellement ouverte
      setSelectedEmployee(data);

      // Fermer la confirmation
      setConfirmAction(null);

      // Afficher le message de réussite
      setNotification({
        type: "success",
        message: isActivation
          ? "L'employé a été réactivé avec succès."
          : "L'employé a été désactivé avec succès.",
      });
    } catch (err) {
      setConfirmAction(null);

      setNotification({
        type: "error",
        message:
          err instanceof TypeError
            ? "Impossible de joindre le serveur. Vérifiez que le backend fonctionne."
            : err.message || "Une erreur est survenue.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Charger la liste au démarrage
  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Recherche et filtrage
  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");

    return employees.filter((employee) => {
      const matchesSearch = [
        employee.matricule,
        employee.first_name,
        employee.last_name,
        employee.department,
        employee.job_title,
      ].some((value) =>
        String(value ?? "").toLocaleLowerCase("fr").includes(query),
      );

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && employee.is_active) ||
        (statusFilter === "inactive" && !employee.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [employees, search, statusFilter]);

  const activeCount = employees.filter(
    (employee) => employee.is_active,
  ).length;

  // Formulaire d'ajout
  if (showEmployeeForm) {
    return (
      <EmployeeForm
        onCancel={() => setShowEmployeeForm(false)}
        onSuccess={handleEmployeeCreated}
      />
    );
  }

  // Formulaire de modification
  if (showEditForm && selectedEmployee) {
    return (
      <EmployeeEditForm
        employee={selectedEmployee}
        onCancel={() => setShowEditForm(false)}
        onSuccess={(updatedEmployee) => {
          setEmployees((previous) =>
            previous.map((employee) =>
              employee.id === updatedEmployee.id
                ? updatedEmployee
                : employee,
            ),
          );

          setSelectedEmployee(updatedEmployee);
          setShowEditForm(false);
          setNotification({
            type: "success",
            message: "Les informations de l'employé ont été modifiées.",
          });
        }}
      />
    );
  }

  // Fiche détaillée
  if (selectedEmployee) {
    const employee = selectedEmployee;

    const initials = `${employee.first_name?.[0] ?? ""}${
      employee.last_name?.[0] ?? ""
    }`.toUpperCase();

    return (
      <div className="employees-page">
        <button
          className="employee-back-button"
          type="button"
          onClick={() => {
            setSelectedEmployee(null);
            setNotification(null);
            setConfirmAction(null);
          }}
        >
          <ArrowLeft size={17} />
          Retour à la liste
        </button>

        <section className="employee-detail-card">
          <div className="employee-detail-header">
            <span className="employee-detail-avatar">{initials}</span>

            <div>
              <div className="employees-eyebrow">FICHE EMPLOYÉ</div>

              <h1>
                {employee.first_name} {employee.last_name}
              </h1>

              <p>{employee.job_title || "Poste non renseigné"}</p>
            </div>

            <span
              className={`status-badge ${
                employee.is_active ? "status-present" : "status-pending"
              }`}
            >
              <span className="status-dot" />
              {employee.is_active ? "Actif" : "Inactif"}
            </span>

            <button
              className="employees-add-button"
              type="button"
              onClick={() => {
                setNotification(null);
                setShowEditForm(true);
              }}
            >
              Modifier
            </button>

            {employee.is_active ? (
              <button
                className="employee-form-cancel"
                type="button"
                onClick={() => openConfirmDialog("deactivate")}
                disabled={actionLoading}
              >
                Désactiver l’employé
              </button>
            ) : (
              <button
                className="employees-add-button"
                type="button"
                onClick={() => openConfirmDialog("activate")}
                disabled={actionLoading}
              >
                Réactiver l’employé
              </button>
            )}
          </div>

          <div className="employee-detail-grid">
            <div className="employee-detail-field">
              <span>Matricule</span>
              <strong>{employee.matricule || "—"}</strong>
            </div>

            <div className="employee-detail-field">
              <span>Prénom</span>
              <strong>{employee.first_name || "—"}</strong>
            </div>

            <div className="employee-detail-field">
              <span>Nom</span>
              <strong>{employee.last_name || "—"}</strong>
            </div>

            <div className="employee-detail-field">
              <span>Département</span>
              <strong>{employee.department || "—"}</strong>
            </div>

            <div className="employee-detail-field">
              <span>Poste occupé</span>
              <strong>{employee.job_title || "—"}</strong>
            </div>

            <div className="employee-detail-field">
              <span>Date d’embauche</span>
              <strong>{employee.hire_date || "—"}</strong>
            </div>

            <div className="employee-detail-field">
              <span>Statut</span>
              <strong>{employee.is_active ? "Actif" : "Inactif"}</strong>
            </div>

            <div className="employee-detail-field">
              <span>Enregistré le</span>
              <strong>
                {employee.created_at
                  ? new Date(employee.created_at).toLocaleDateString("fr-FR")
                  : "—"}
              </strong>
            </div>
          </div>
        </section>

        {/* Fenêtre de confirmation personnalisée */}
        <ConfirmDialog
          open={Boolean(confirmAction)}
          title={
            confirmAction === "deactivate"
              ? "Désactiver cet employé ?"
              : "Réactiver cet employé ?"
          }
          message={
            confirmAction === "deactivate"
              ? `Voulez-vous désactiver ${employee.first_name} ${employee.last_name} ? Sa fiche et son historique seront conservés.`
              : `Voulez-vous réactiver ${employee.first_name} ${employee.last_name} ?`
          }
          confirmLabel={
            confirmAction === "deactivate" ? "Désactiver" : "Réactiver"
          }
          cancelLabel="Annuler"
          variant={confirmAction === "deactivate" ? "danger" : "success"}
          loading={actionLoading}
          onConfirm={handleEmployeeStatusChange}
          onCancel={() => {
            if (!actionLoading) {
              setConfirmAction(null);
            }
          }}
        />

        {/* Notification de succès ou d'erreur */}
        {notification && (
          <div
            className={`employee-notification employee-notification-${notification.type}`}
            role={notification.type === "error" ? "alert" : "status"}
          >
            {notification.type === "success" ? (
              <CheckCircle2 size={21} />
            ) : (
              <AlertCircle size={21} />
            )}

            <span>{notification.message}</span>

            <button
              type="button"
              onClick={() => setNotification(null)}
              aria-label="Fermer la notification"
            >
              <X size={17} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Liste des employés
  return (
    <div className="employees-page">
      <section className="employees-heading">
        <div>
          <div className="employees-eyebrow">
            <span className="employees-eyebrow-dot" />
            GESTION DU PERSONNEL
          </div>

          <h1>Employés</h1>
          <p>Consultez les fiches de votre personnel.</p>
        </div>

        <button
          className="employees-add-button"
          type="button"
          onClick={() => setShowEmployeeForm(true)}
        >
          <UserRoundPlus size={18} />
          <span>Ajouter un employé</span>
        </button>
      </section>

      <section className="employees-summary">
        <div className="employees-summary-icon">
          <Users size={23} />
        </div>

        <div>
          <span className="employees-summary-label">
            Effectif du personnel
          </span>

          <strong>
            {loading ? "…" : error ? "—" : employees.length}
          </strong>

          <span className="employees-summary-note">
            {loading
              ? "Chargement des données…"
              : error
                ? "Effectif indisponible"
                : `${activeCount} employé(s) actif(s)`}
          </span>
        </div>
      </section>

      <section className="employees-panel">
        <div className="employees-panel-heading">
          <div>
            <h2>Liste des employés</h2>
            <p>Données récupérées depuis l'API StaffTrack.</p>
          </div>

          <button
            className="employees-refresh-button"
            type="button"
            onClick={loadEmployees}
            disabled={loading}
            title="Actualiser la liste"
            aria-label="Actualiser la liste"
          >
            <RefreshCw size={17} />
          </button>
        </div>

        <div className="employees-toolbar">
          <label className="employees-search">
            <Search size={18} />

            <input
              type="search"
              placeholder="Nom, prénom ou matricule..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Rechercher un employé"
            />
          </label>

          <label className="employees-filter">
            <SlidersHorizontal size={17} />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filtrer les employés par statut"
            >
              <option value="active">Employés actifs</option>
              <option value="all">Tous les employés</option>
              <option value="inactive">Employés inactifs</option>
            </select>
          </label>
        </div>

        <div className="employees-table-wrapper">
          <table className="employees-table">
            <thead>
              <tr>
                <th>MATRICULE</th>
                <th>EMPLOYÉ</th>
                <th>DÉPARTEMENT</th>
                <th>POSTE</th>
                <th>STATUT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="employees-empty-state">
                      <strong>Chargement des employés…</strong>
                      <p>Récupération des données depuis le serveur.</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6}>
                    <div className="employees-empty-state">
                      <strong>Impossible de charger les employés</strong>
                      <p>{error}</p>

                      <button
                        className="employees-refresh-button"
                        type="button"
                        onClick={loadEmployees}
                      >
                        Réessayer
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="employees-empty-state">
                      <div className="employees-empty-icon">
                        <Users size={28} />
                      </div>

                      <strong>
                        {employees.length === 0
                          ? "Aucun employé enregistré"
                          : "Aucun résultat"}
                      </strong>

                      <p>
                        {employees.length === 0
                          ? "L'API n'a retourné aucun employé."
                          : "Essayez un autre terme de recherche ou un autre filtre."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.matricule}</td>

                    <td>
                      <div className="employee-cell">
                        <span className="employee-avatar avatar-green">
                          {`${employee.first_name?.[0] ?? ""}${
                            employee.last_name?.[0] ?? ""
                          }`.toUpperCase()}
                        </span>

                        <button
                          type="button"
                          className="employee-name-button"
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setNotification(null);
                          }}
                        >
                          {employee.first_name} {employee.last_name}
                        </button>
                      </div>
                    </td>

                    <td>{employee.department || "—"}</td>
                    <td>{employee.job_title || "—"}</td>

                    <td>
                      <span
                        className={`status-badge ${
                          employee.is_active
                            ? "status-present"
                            : "status-pending"
                        }`}
                      >
                        <span className="status-dot" />
                        {employee.is_active ? "Actif" : "Inactif"}
                      </span>
                    </td>

                    <td>—</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="employees-table-footer">
          <span>
            {loading || error
              ? "Résultats indisponibles"
              : `${filteredEmployees.length} employé(s) affiché(s) sur ${employees.length}`}
          </span>

          <span className="employees-local-label">
            <span />
            API StaffTrack
          </span>
        </div>
      </section>
    </div>
  );
}

export default Employees;
