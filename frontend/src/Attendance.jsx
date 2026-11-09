import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Clock3,
  RefreshCw,
  Search,
  LogIn,
  LogOut,
  Pencil,
  History,
  X,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";

import "./Attendance.css";

const API = "http://127.0.0.1:8000";

const todayISO = () => {
  const now = new Date();
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000,
  );
  return localDate.toISOString().slice(0, 10);
};

// Affiche HH:MM, ou "—" si vide.
const formatTime = (value) => (value ? String(value).slice(0, 5) : "—");

// Les dates du serveur sont interprétées en UTC lorsqu'elles n'ont pas de fuseau.
const parseServerDate = (value) => {
  if (!value) return null;

  const text = String(value);
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text);

  return new Date(hasZone ? text : `${text}Z`);
};

const formatServerDateTime = (value) => {
  const date = parseServerDate(value);

  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("fr-FR")
    : "—";
};

const formatLongDate = (isoDate) => {
  if (!isoDate) return "Date non renseignée";

  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

// Gère les erreurs FastAPI : HTTPException ou validation Pydantic.
const errorMessage = (data, fallback) => {
  const detail = data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const message = detail[0]?.msg;

    if (typeof message === "string") {
      return message.replace(/^Value error,\s*/i, "");
    }
  }

  return fallback;
};

const networkOrMessage = (err, networkText) =>
  err instanceof TypeError
    ? networkText
    : err.message || "Une erreur est survenue.";

const fieldLabel = (field) => {
  const labels = {
    check_in: "Heure d'arrivée",
    check_out: "Heure de départ",
    notes: "Notes",
    absence_type: "Type d'absence",
    absence_reason: "Motif de l'absence",
  };

  return labels[field] || field;
};

// Présente correctement les valeurs dans l'historique.
const formatHistoryValue = (field, value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (field === "check_in" || field === "check_out") {
    return formatTime(value);
  }

  if (field === "absence_type") {
    if (value === "justifie") return "Absence justifiée";
    if (value === "injustifie") return "Absence injustifiée";
  }

  // Ne pas tronquer les motifs : ils peuvent contenir une phrase complète.
  return String(value);
};

function Attendance() {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);

  // Modale de correction de présence ou de gestion d'absence.
  const [dialog, setDialog] = useState(null);
  const [timeValue, setTimeValue] = useState("");
  const [reason, setReason] = useState("");
  const [modalError, setModalError] = useState("");

  // Champs spécifiques aux absences.
  const [absenceType, setAbsenceType] = useState("justifie");
  const [absenceReason, setAbsenceReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const abortRef = useRef(null);

  // Chargement des employés actifs et des fiches de la date sélectionnée.
  const loadData = useCallback(async () => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const [employeesResponse, attendanceResponse] = await Promise.all([
        fetch(`${API}/employees/?active_only=true`, {
          signal: controller.signal,
        }),
        fetch(
          `${API}/attendance/?attendance_date=${encodeURIComponent(
            selectedDate,
          )}`,
          { signal: controller.signal },
        ),
      ]);

      const employeesData = await employeesResponse.json().catch(() => null);
      const attendanceData = await attendanceResponse.json().catch(() => null);

      if (controller.signal.aborted) return;

      if (!employeesResponse.ok) {
        throw new Error(
          errorMessage(employeesData, "Impossible de charger les employés."),
        );
      }

      if (!attendanceResponse.ok) {
        throw new Error(
          errorMessage(attendanceData, "Impossible de charger les présences."),
        );
      }

      if (
        !Array.isArray(employeesData) ||
        !Array.isArray(attendanceData)
      ) {
        throw new Error(
          "Le serveur a retourné un format de données inattendu.",
        );
      }

      setEmployees(employeesData);
      setRecords(attendanceData);
    } catch (err) {
      if (err?.name === "AbortError") return;

      setError(
        networkOrMessage(
          err,
          "Impossible de joindre l'API. Vérifiez que le backend est démarré.",
        ),
      );

      setEmployees([]);
      setRecords([]);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();

    return () => abortRef.current?.abort();
  }, [loadData]);

  // Échap ferme la modale ouverte.
  useEffect(() => {
    if (!dialog) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setDialog(null);
        setModalError("");
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog]);

  const recordByEmployee = useMemo(
    () => new Map(records.map((record) => [record.employee_id, record])),
    [records],
  );

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");

    return employees.filter((employee) =>
      [
        employee.matricule,
        employee.first_name,
        employee.last_name,
        employee.department,
      ].some((value) =>
        String(value ?? "").toLocaleLowerCase("fr").includes(query),
      ),
    );
  }, [employees, search]);

  // Statistiques de la journée.
  const counts = useMemo(() => {
    let present = 0;
    let complete = 0;
    let absences = 0;

    for (const employee of employees) {
      const record = recordByEmployee.get(employee.id);

      if (record?.absence_type) {
        absences += 1;
      }

      if (record?.check_in) {
        present += 1;
      }

      if (record?.check_in && record?.check_out) {
        complete += 1;
      }
    }

    return {
      total: employees.length,
      present,
      absences,
      missing: employees.length - present - absences,
      incomplete: present - complete,
    };
  }, [employees, recordByEmployee]);

  const showNotice = (type, message) => setNotice({ type, message });

  // Enregistrer une arrivée.
  const handleArrival = async (employee) => {
    setSavingId(employee.id);
    setNotice(null);

    try {
      const response = await fetch(`${API}/attendance/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employee.id,
          attendance_date: selectedDate,
          check_in: new Date().toTimeString().slice(0, 5),
          notes: null,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          errorMessage(data, "Impossible d'enregistrer l'arrivée."),
        );
      }

      showNotice("success", "L'heure d'arrivée a été enregistrée.");
      await loadData();
    } catch (err) {
      showNotice(
        "error",
        networkOrMessage(err, "Impossible de joindre le serveur."),
      );
    } finally {
      setSavingId(null);
    }
  };

  // Enregistrer un départ.
  const handleDeparture = async (record) => {
    setSavingId(record.employee_id);
    setNotice(null);

    try {
      const response = await fetch(
        `${API}/attendance/${record.id}/check-out`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            check_out: new Date().toTimeString().slice(0, 5),
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          errorMessage(data, "Impossible d'enregistrer le départ."),
        );
      }

      showNotice("success", "L'heure de départ a été enregistrée.");
      await loadData();
    } catch (err) {
      showNotice(
        "error",
        networkOrMessage(err, "Impossible de joindre le serveur."),
      );
    } finally {
      setSavingId(null);
    }
  };

  // Ouvrir la modale de correction d'une heure.
  const openCorrection = (record, field) => {
    setDialog({ type: "edit", record, field });

    setTimeValue(
      formatTime(record[field]) === "—" ? "" : formatTime(record[field]),
    );

    setReason("");
    setModalError("");
    setNotice(null);
  };

  // Enregistrer une correction de présence.
  const saveCorrection = async (event) => {
    event.preventDefault();

    if (!dialog?.record || !reason.trim()) {
      setModalError("Le motif de correction est obligatoire.");
      return;
    }

    const field = dialog.field;
    const value = timeValue.trim() || null;
    const currentValue = formatTime(dialog.record[field]);

    setModalError("");

    if (field === "check_in" && !value) {
      setModalError("L'heure d'arrivée ne peut pas être supprimée.");
      return;
    }

    if ((value ?? "—") === currentValue) {
      setModalError(
        "Aucune modification : l'heure est identique à l'actuelle.",
      );
      return;
    }

    if (
      field === "check_in" &&
      dialog.record.check_out &&
      value >= formatTime(dialog.record.check_out)
    ) {
      setModalError("L'arrivée doit être antérieure au départ.");
      return;
    }

    if (
      field === "check_out" &&
      dialog.record.check_in &&
      value &&
      value <= formatTime(dialog.record.check_in)
    ) {
      setModalError("Le départ doit être postérieur à l'arrivée.");
      return;
    }

    setSavingId(dialog.record.employee_id);
    setNotice(null);

    try {
      const response = await fetch(`${API}/attendance/${dialog.record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [field]: value,
          reason: reason.trim(),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessage(data, "La correction a échoué."));
      }

      setDialog(null);

      showNotice(
        "success",
        "La correction a été enregistrée dans l'historique.",
      );

      await loadData();
    } catch (err) {
      setModalError(
        networkOrMessage(err, "Impossible de joindre le serveur."),
      );
    } finally {
      setSavingId(null);
    }
  };

  // Ouvrir la modale de création d'une absence.
  const openAbsenceCreate = (employee) => {
    setDialog({ type: "absence-create", employee });
    setAbsenceType("justifie");
    setAbsenceReason("");
    setCorrectionReason("");
    setModalError("");
    setNotice(null);
  };

  // Ouvrir la modale de correction d'une absence existante.
  const openAbsenceEdit = (record, employee) => {
    setDialog({ type: "absence-edit", record, employee });
    setAbsenceType(record.absence_type || "justifie");
    setAbsenceReason(record.absence_reason || "");
    setCorrectionReason("");
    setModalError("");
    setNotice(null);
  };

  // Créer ou corriger une absence.
  const saveAbsence = async (event) => {
    event.preventDefault();

    if (!dialog) return;

    if (!absenceReason.trim()) {
      setModalError("Le motif de l'absence est obligatoire.");
      return;
    }

    const editing = dialog.type === "absence-edit";

    if (editing && !correctionReason.trim()) {
      setModalError("Le motif de correction est obligatoire.");
      return;
    }

    const employeeId = editing
      ? dialog.record.employee_id
      : dialog.employee.id;

    setSavingId(employeeId);
    setModalError("");
    setNotice(null);

    try {
      const url = editing
        ? `${API}/attendance/absence/${dialog.record.id}`
        : `${API}/attendance/absence`;

      const body = editing
        ? {
            absence_type: absenceType,
            absence_reason: absenceReason.trim(),
            reason: correctionReason.trim(),
          }
        : {
            employee_id: dialog.employee.id,
            attendance_date: selectedDate,
            absence_type: absenceType,
            absence_reason: absenceReason.trim(),
          };

      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          errorMessage(
            data,
            editing
              ? "La correction de l'absence a échoué."
              : "L'enregistrement de l'absence a échoué.",
          ),
        );
      }

      setDialog(null);

      showNotice(
        "success",
        editing
          ? "L'absence a été corrigée et ajoutée à l'historique."
          : "L'absence a été enregistrée.",
      );

      await loadData();
    } catch (err) {
      setModalError(
        networkOrMessage(err, "Impossible de joindre le serveur."),
      );
    } finally {
      setSavingId(null);
    }
  };

  // Charger l'historique des corrections d'une fiche.
  const openHistory = async (record) => {
    setDialog({ type: "history", record });
    setHistory([]);
    setHistoryLoading(true);
    setNotice(null);

    try {
      const response = await fetch(
        `${API}/attendance/${record.id}/corrections`,
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          errorMessage(data, "Impossible de charger l'historique."),
        );
      }

      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      showNotice(
        "error",
        networkOrMessage(err, "Impossible de joindre le serveur."),
      );
      setDialog(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const employeeName = (employee) =>
    `${employee.first_name} ${employee.last_name}`;

  return (
    <div className="attendance-page">
      <section className="attendance-heading">
        <div>
          <div className="attendance-eyebrow">
            <span />
            SUIVI DU PERSONNEL
          </div>

          <h1>Présences</h1>

          <p>Enregistrez et consultez les horaires de votre personnel.</p>
        </div>

        <button
          className="attendance-refresh"
          type="button"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </section>

      <section className="attendance-toolbar">
        <label className="attendance-date-field">
          <CalendarDays size={18} />
          <span>Date</span>

          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>

        <label className="attendance-search">
          <Search size={18} />

          <input
            type="search"
            placeholder="Rechercher un employé..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      <section className="attendance-metrics">
        <article>
          <span className="attendance-metric-icon metric-total">
            <Users size={19} />
          </span>

          <div>
            <span>Employés actifs</span>
            <strong>{loading ? "…" : counts.total}</strong>
          </div>
        </article>

        <article>
          <span className="attendance-metric-icon metric-present">
            <CheckCircle2 size={19} />
          </span>

          <div>
            <span>Arrivées enregistrées</span>
            <strong>{loading ? "…" : counts.present}</strong>
          </div>
        </article>

        <article>
          <span className="attendance-metric-icon metric-missing">
            <AlertCircle size={19} />
          </span>

          <div>
            <span>Absences enregistrées</span>
            <strong>{loading ? "…" : counts.absences}</strong>
          </div>
        </article>

        <article>
          <span className="attendance-metric-icon metric-pending">
            <Clock3 size={19} />
          </span>

          <div>
            <span>Départs à saisir</span>
            <strong>{loading ? "…" : counts.incomplete}</strong>
          </div>
        </article>
      </section>

      {notice && (
        <div
          className={`attendance-notice notice-${notice.type}`}
          role="status"
        >
          {notice.type === "success" ? (
            <CheckCircle2 size={19} />
          ) : (
            <AlertCircle size={19} />
          )}

          <span>{notice.message}</span>

          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setNotice(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}

      <section className="attendance-panel">
        <div className="attendance-panel-header">
          <div>
            <h2>Registre journalier</h2>

            <p>
              {selectedDate
                ? formatLongDate(selectedDate)
                : "Sélectionnez une date"}
            </p>
          </div>

          <span className="attendance-api-label">
            <span /> Données de l'API
          </span>
        </div>

        {error ? (
          <div className="attendance-empty">
            <AlertCircle size={27} />
            <strong>Chargement impossible</strong>
            <p>{error}</p>

            <button type="button" onClick={loadData}>
              Réessayer
            </button>
          </div>
        ) : loading ? (
          <div className="attendance-empty">
            <RefreshCw size={23} className="attendance-spin" />
            <p>Chargement des présences…</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="attendance-empty">
            <Users size={27} />
            <strong>Aucun employé trouvé</strong>
            <p>Essayez une autre recherche ou ajoutez un employé actif.</p>
          </div>
        ) : (
          <div className="attendance-table-wrap">
            <table className="attendance-real-table">
              <thead>
                <tr>
                  <th>EMPLOYÉ</th>
                  <th>DÉPARTEMENT</th>
                  <th>ARRIVÉE</th>
                  <th>DÉPART</th>
                  <th>STATUT</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {filteredEmployees.map((employee) => {
                  const record = recordByEmployee.get(employee.id);
                  const isAbsence = Boolean(record?.absence_type);
                  const arrived = Boolean(record?.check_in);
                  const departed = Boolean(record?.check_out);

                  const initials =
                    `${employee.first_name?.[0] || ""}${
                      employee.last_name?.[0] || ""
                    }`.toUpperCase();

                  let statusClass = "status-absent";
                  let statusLabel = "Non pointé";

                  if (isAbsence) {
                    if (record.absence_type === "justifie") {
                      statusClass = "status-absence-justifie";
                      statusLabel = "Absent justifié";
                    } else {
                      statusClass = "status-absence-injustifie";
                      statusLabel = "Absent injustifié";
                    }
                  } else if (departed) {
                    statusClass = "status-done";
                    statusLabel = "Terminé";
                  } else if (arrived) {
                    statusClass = "status-open";
                    statusLabel = "En cours";
                  }

                  return (
                    <tr key={employee.id}>
                      <td>
                        <div className="attendance-employee">
                          <span className="attendance-avatar">{initials}</span>

                          <div>
                            <strong>{employeeName(employee)}</strong>
                            <span>{employee.matricule}</span>
                          </div>
                        </div>
                      </td>

                      <td>{employee.department || "—"}</td>

                      <td className="attendance-time">
                        {formatTime(record?.check_in)}
                      </td>

                      <td className="attendance-time">
                        {formatTime(record?.check_out)}
                      </td>

                      <td>
                        <span
                          className={`attendance-status ${statusClass}`}
                          title={
                            isAbsence
                              ? record.absence_reason || "Motif non renseigné"
                              : undefined
                          }
                        >
                          <span />
                          {statusLabel}
                        </span>
                      </td>

                      <td>
                        <div className="attendance-actions">
                          {!record ? (
                            <>
                              <button
                                className="attendance-action arrival-action"
                                type="button"
                                disabled={savingId === employee.id}
                                onClick={() => handleArrival(employee)}
                                title="Enregistrer l'arrivée à l'heure actuelle"
                              >
                                <LogIn size={15} />
                                Arrivée
                              </button>

                              <button
                                className="attendance-action absence-action"
                                type="button"
                                disabled={savingId === employee.id}
                                onClick={() => openAbsenceCreate(employee)}
                                title="Enregistrer une absence"
                              >
                                <AlertCircle size={15} />
                                Absence
                              </button>
                            </>
                          ) : isAbsence ? (
                            <>
                              <button
                                className="attendance-icon-action"
                                type="button"
                                title="Corriger l'absence"
                                aria-label={`Corriger l'absence de ${employeeName(
                                  employee,
                                )}`}
                                onClick={() =>
                                  openAbsenceEdit(record, employee)
                                }
                              >
                                <Pencil size={15} />
                              </button>

                              <button
                                className="attendance-icon-action"
                                type="button"
                                title="Historique des corrections"
                                aria-label={`Historique des corrections de ${employeeName(
                                  employee,
                                )}`}
                                onClick={() => openHistory(record)}
                              >
                                <History size={15} />
                              </button>
                            </>
                          ) : (
                            <>
                              {arrived && !departed && (
                                <button
                                  className="attendance-action departure-action"
                                  type="button"
                                  disabled={savingId === employee.id}
                                  onClick={() => handleDeparture(record)}
                                  title="Enregistrer le départ à l'heure actuelle"
                                >
                                  <LogOut size={15} />
                                  Départ
                                </button>
                              )}

                              <button
                                className="attendance-icon-action"
                                type="button"
                                title="Corriger l'arrivée"
                                aria-label={`Corriger l'arrivée de ${employeeName(
                                  employee,
                                )}`}
                                onClick={() =>
                                  openCorrection(record, "check_in")
                                }
                              >
                                <Pencil size={15} />
                              </button>

                              <button
                                className="attendance-icon-action"
                                type="button"
                                title="Corriger le départ"
                                aria-label={`Corriger le départ de ${employeeName(
                                  employee,
                                )}`}
                                onClick={() =>
                                  openCorrection(record, "check_out")
                                }
                              >
                                <Clock3 size={15} />
                              </button>

                              <button
                                className="attendance-icon-action"
                                type="button"
                                title="Historique des corrections"
                                aria-label={`Historique des corrections de ${employeeName(
                                  employee,
                                )}`}
                                onClick={() => openHistory(record)}
                              >
                                <History size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="attendance-table-footer">
          <span>
            {loading
              ? "Chargement…"
              : `${filteredEmployees.length} employé(s) affiché(s)`}
          </span>

          <span>Les heures et les absences sont enregistrées par le responsable.</span>
        </div>
      </section>

      {/* Modale de correction d'une présence */}
      {dialog?.type === "edit" && (
        <div
          className="attendance-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDialog(null);
              setModalError("");
            }
          }}
        >
          <section
            className="attendance-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-edit-title"
          >
            <div className="attendance-modal-heading">
              <div>
                <h2 id="attendance-edit-title">Corriger une présence</h2>
                <p>La modification sera conservée dans l'historique.</p>
              </div>

              <button
                type="button"
                onClick={() => setDialog(null)}
                aria-label="Fermer"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveCorrection}>
              {modalError && (
                <div className="attendance-notice notice-error" role="alert">
                  <AlertCircle size={19} />
                  <span>{modalError}</span>
                </div>
              )}

              <label>
                Champ à corriger

                <select
                  value={dialog.field}
                  onChange={(event) => {
                    const field = event.target.value;

                    setDialog({ ...dialog, field });

                    setTimeValue(
                      formatTime(dialog.record[field]) === "—"
                        ? ""
                        : formatTime(dialog.record[field]),
                    );

                    setModalError("");
                  }}
                >
                  <option value="check_in">Heure d'arrivée</option>
                  <option value="check_out">Heure de départ</option>
                </select>
              </label>

              <label>
                Nouvelle heure

                <input
                  type="time"
                  value={timeValue}
                  required={dialog.field === "check_in"}
                  onChange={(event) => setTimeValue(event.target.value)}
                />

                <small>
                  {dialog.field === "check_out"
                    ? "Laissez vide pour retirer l'heure de départ, si nécessaire."
                    : "L'heure d'arrivée est obligatoire."}
                </small>
              </label>

              <label>
                Motif obligatoire

                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ex. : oubli de saisie, heure corrigée après vérification…"
                  minLength={1}
                  maxLength={500}
                  required
                />
              </label>

              <div className="attendance-modal-actions">
                <button
                  className="attendance-cancel"
                  type="button"
                  onClick={() => setDialog(null)}
                >
                  Annuler
                </button>

                <button
                  className="attendance-save"
                  type="submit"
                  disabled={!reason.trim() || savingId !== null}
                >
                  {savingId !== null
                    ? "Enregistrement…"
                    : "Enregistrer la correction"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Modale de création ou de correction d'une absence */}
      {(dialog?.type === "absence-create" ||
        dialog?.type === "absence-edit") && (
        <div
          className="attendance-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDialog(null);
              setModalError("");
            }
          }}
        >
          <section
            className="attendance-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-absence-title"
          >
            <div className="attendance-modal-heading">
              <div>
                <h2 id="attendance-absence-title">
                  {dialog.type === "absence-edit"
                    ? "Corriger une absence"
                    : "Enregistrer une absence"}
                </h2>

                <p>
                  {employeeName(
                    dialog.employee ||
                      employees.find(
                        (employee) =>
                          employee.id === dialog.record?.employee_id,
                      ) || {
                        first_name: "Employé",
                        last_name: "",
                      },
                  )}
                  {" · "}
                  {formatLongDate(
                    dialog.type === "absence-edit"
                      ? dialog.record.attendance_date
                      : selectedDate,
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDialog(null)}
                aria-label="Fermer"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveAbsence}>
              {modalError && (
                <div className="attendance-notice notice-error" role="alert">
                  <AlertCircle size={19} />
                  <span>{modalError}</span>
                </div>
              )}

              <label>
                Type d'absence

                <select
                  value={absenceType}
                  onChange={(event) => setAbsenceType(event.target.value)}
                  required
                >
                  <option value="justifie">Absence justifiée</option>
                  <option value="injustifie">Absence injustifiée</option>
                </select>
              </label>

              <label>
                Motif de l'absence

                <textarea
                  value={absenceReason}
                  onChange={(event) => setAbsenceReason(event.target.value)}
                  placeholder="Ex. : maladie, autorisation accordée, absence sans justificatif…"
                  minLength={1}
                  maxLength={500}
                  required
                />

                <small>Le motif est obligatoire (500 caractères maximum).</small>
              </label>

              {dialog.type === "absence-edit" && (
                <label>
                  Motif de correction

                  <textarea
                    value={correctionReason}
                    onChange={(event) =>
                      setCorrectionReason(event.target.value)
                    }
                    placeholder="Expliquez pourquoi cette absence doit être corrigée…"
                    minLength={1}
                    maxLength={500}
                    required
                  />

                  <small>
                    Cette explication sera conservée dans l'historique.
                  </small>
                </label>
              )}

              <div className="attendance-modal-actions">
                <button
                  className="attendance-cancel"
                  type="button"
                  onClick={() => setDialog(null)}
                >
                  Annuler
                </button>

                <button
                  className="attendance-save"
                  type="submit"
                  disabled={
                    !absenceReason.trim() ||
                    (dialog.type === "absence-edit" &&
                      !correctionReason.trim()) ||
                    savingId !== null
                  }
                >
                  {savingId !== null
                    ? "Enregistrement…"
                    : dialog.type === "absence-edit"
                      ? "Enregistrer la correction"
                      : "Enregistrer l'absence"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Modale d'historique des corrections */}
      {dialog?.type === "history" && (
        <div
          className="attendance-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialog(null);
          }}
        >
          <section
            className="attendance-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-history-title"
          >
            <div className="attendance-modal-heading">
              <div>
                <h2 id="attendance-history-title">
                  Historique des corrections
                </h2>

                <p>{formatLongDate(dialog.record.attendance_date)}</p>
              </div>

              <button
                type="button"
                onClick={() => setDialog(null)}
                aria-label="Fermer"
              >
                <X size={19} />
              </button>
            </div>

            {historyLoading ? (
              <div className="attendance-empty">
                <RefreshCw size={22} className="attendance-spin" />
                <p>Chargement de l'historique…</p>
              </div>
            ) : history.length === 0 ? (
              <div className="attendance-empty">
                <History size={27} />
                <strong>Aucune correction enregistrée</strong>
                <p>Les modifications futures apparaîtront ici.</p>
              </div>
            ) : (
              <div className="attendance-history-list">
                {history.map((item) => (
                  <article key={item.id}>
                    <div className="attendance-history-top">
                      <strong>{fieldLabel(item.field_name)}</strong>
                      <span>{formatServerDateTime(item.corrected_at)}</span>
                    </div>

                    <p>
                      <span>
                        {formatHistoryValue(item.field_name, item.old_value)}
                      </span>
                      {" → "}
                      <strong>
                        {formatHistoryValue(item.field_name, item.new_value)}
                      </strong>
                    </p>

                    <p className="attendance-history-reason">
                      {item.reason}
                    </p>

                    <small>Par : {item.author}</small>
                  </article>
                ))}
              </div>
            )}

            <div className="attendance-modal-actions">
              <button
                className="attendance-cancel"
                type="button"
                onClick={() => setDialog(null)}
              >
                Fermer
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default Attendance;
