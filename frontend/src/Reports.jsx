
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Download,
  RefreshCw,
  Users,
  UserX,
  AlertTriangle,
} from "lucide-react";
import "./Reports.css";

const API_URL = "http://127.0.0.1:8000";

function getLocalDateISO(date = new Date()) {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return localDate.toISOString().slice(0, 10);
}

function getMonthStartISO() {
  const date = new Date();
  date.setDate(1);
  return getLocalDateISO(date);
}

function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : "—";
}

function formatDuration(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  return `${hours} h ${String(remainingMinutes).padStart(2, "0")}`;
}

function formatHours(minutes) {
  return `${((Number(minutes) || 0) / 60).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })} h`;
}

function isLate(record) {
  return Boolean(
    record.check_in &&
      !record.absence_type &&
      formatTime(record.check_in) > "08:20"
  );
}

function getAbsenceLabel(type) {
  const normalized = String(type || "").toLowerCase();

  if (normalized === "justifie") return "Absence justifiée";
  if (normalized === "injustifie") return "Absence injustifiée";

  return "—";
}

function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;

  return [];
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function Reports() {
  const today = getLocalDateISO();

  const [dateFrom, setDateFrom] = useState(getMonthStartISO);
  const [dateTo, setDateTo] = useState(today);
  const [selectedEmployee, setSelectedEmployee] = useState("all");

  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadData = useCallback(async (from = dateFrom, to = dateTo) => {
    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      if (!from || !to) {
        throw new Error("Sélectionne une date de début et une date de fin.");
      }

      if (from > to) {
        throw new Error(
          "La date de début doit être antérieure ou égale à la date de fin."
        );
      }

      const params = new URLSearchParams({
        date_from: from,
        date_to: to,
      });

      const [reportResponse, employeesResponse] = await Promise.all([
        fetch(`${API_URL}/attendance/report?${params.toString()}`),
        fetch(`${API_URL}/employees/?active_only=false`),
      ]);

      if (!reportResponse.ok) {
        throw new Error(
          "Impossible de charger les données du rapport. Vérifie le serveur."
        );
      }

      if (!employeesResponse.ok) {
        throw new Error(
          "Impossible de récupérer la liste des employés."
        );
      }

      const [reportData, employeesData] = await Promise.all([
        reportResponse.json(),
        employeesResponse.json(),
      ]);

      if (!Array.isArray(employeesData)) {
        throw new Error("Le format de la liste des employés est invalide.");
      }

      setRecords(normalizeRows(reportData));
      setEmployees(employeesData);
    } catch (err) {
      setRecords([]);
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue lors du chargement des rapports."
      );
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesEmployee =
        selectedEmployee === "all" ||
        String(record.employee_id) === String(selectedEmployee);

      return (
        record.attendance_date >= dateFrom &&
        record.attendance_date <= dateTo &&
        matchesEmployee
      );
    });
  }, [records, dateFrom, dateTo, selectedEmployee]);

  const employeeStats = useMemo(() => {
    return employees
      .map((employee) => {
        const employeeRecords = filteredRecords.filter(
          (record) =>
            String(record.employee_id) === String(employee.id)
        );

        const presenceRecords = employeeRecords.filter(
          (record) => Boolean(record.check_in)
        );

        const lateRecords = presenceRecords.filter(isLate);

        const justifiedAbsences = employeeRecords.filter(
          (record) =>
            String(record.absence_type || "").toLowerCase() === "justifie"
        );

        const unjustifiedAbsences = employeeRecords.filter(
          (record) =>
            String(record.absence_type || "").toLowerCase() === "injustifie"
        );

        const workedMinutes = presenceRecords.reduce(
          (total, record) => {
            if (
              record.worked_minutes === null ||
              record.worked_minutes === undefined ||
              record.worked_minutes === ""
            ) {
              return total;
            }

            const minutes = Number(record.worked_minutes);

            return Number.isFinite(minutes) && minutes > 0
              ? total + minutes
              : total;
          },
          0
        );

        return {
          id: employee.id,
          matricule: employee.matricule || "—",
          name: `${employee.first_name || ""} ${
            employee.last_name || ""
          }`.trim() || "Employé sans nom",
          department: employee.department || "—",
          presenceCount: presenceRecords.length,
          workedMinutes,
          lateCount: lateRecords.length,
          justifiedAbsences: justifiedAbsences.length,
          unjustifiedAbsences: unjustifiedAbsences.length,
        };
      })
      .filter(
        (employee) =>
          selectedEmployee === "all" ||
          String(employee.id) === String(selectedEmployee)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [employees, filteredRecords, selectedEmployee]);

  const summary = useMemo(() => {
    const presenceRecords = filteredRecords.filter(
      (record) => Boolean(record.check_in)
    );

    const absenceRecords = filteredRecords.filter(
      (record) => Boolean(record.absence_type)
    );

    const lateRecords = presenceRecords.filter(isLate);

    const workedMinutes = presenceRecords.reduce(
      (total, record) => {
        if (
          record.worked_minutes === null ||
          record.worked_minutes === undefined ||
          record.worked_minutes === ""
        ) {
          return total;
        }

        const minutes = Number(record.worked_minutes);

        return Number.isFinite(minutes) && minutes > 0
          ? total + minutes
          : total;
      },
      0
    );

    return {
      presenceCount: presenceRecords.length,
      absenceCount: absenceRecords.length,
      lateCount: lateRecords.length,
      workedMinutes,
      justifiedCount: absenceRecords.filter(
        (record) =>
          String(record.absence_type).toLowerCase() === "justifie"
      ).length,
      unjustifiedCount: absenceRecords.filter(
        (record) =>
          String(record.absence_type).toLowerCase() === "injustifie"
      ).length,
    };
  }, [filteredRecords]);

  const handlePreset = (preset) => {
    const end = getLocalDateISO();
    let start = end;

    if (preset === "week") {
      const date = new Date();
      date.setDate(date.getDate() - 6);
      start = getLocalDateISO(date);
    } else if (preset === "month") {
      start = getMonthStartISO();
    }

    setDateFrom(start);
    setDateTo(end);
    setSelectedEmployee("all");
    loadData(start, end);
  };

  const handleApplyFilters = () => {
    loadData(dateFrom, dateTo);
  };

  const handleExportCsv = () => {
    if (filteredRecords.length === 0) {
      setError("Aucune donnée à exporter pour les filtres sélectionnés.");
      return;
    }

    const headers = [
      "Date",
      "Matricule",
      "Prénom",
      "Nom",
      "Département",
      "Arrivée",
      "Départ",
      "Statut d'absence",
      "Motif d'absence",
      "Heures travaillées (minutes)",
      "Retard",
      "Nombre de corrections",
      "Notes",
    ];

    const employeeById = new Map(
      employees.map((employee) => [String(employee.id), employee])
    );

    const lines = filteredRecords.map((record) => {
      const employee = employeeById.get(String(record.employee_id)) || {};

      return [
        record.attendance_date,
        employee.matricule || record.matricule || "",
        employee.first_name || record.first_name || "",
        employee.last_name || record.last_name || "",
        employee.department || record.department || "",
        formatTime(record.check_in),
        formatTime(record.check_out),
        getAbsenceLabel(record.absence_type),
        record.absence_reason || "",
        record.worked_minutes ?? "",
        isLate(record) ? "Oui" : "Non",
        record.corrections_count ?? 0,
        record.notes || "",
      ];
    });

    const csv = [
      headers.map(escapeCsv).join(";"),
      ...lines.map((line) => line.map(escapeCsv).join(";")),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `stafftrack-rapport-${dateFrom}-${dateTo}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setError("");
    setSuccessMessage("Le fichier CSV a été généré.");
  };

  return (
    <div className="reports-page">
      <section className="reports-heading">
        <div>
          <div className="reports-eyebrow">
            <BarChart3 size={16} />
            ANALYSE DU PERSONNEL
          </div>

          <h1>Rapports et statistiques</h1>

          <p>
            Consulte les présences, les horaires, les retards et les absences
            sur la période choisie.
          </p>
        </div>

        <button
          type="button"
          className="reports-export-button"
          onClick={handleExportCsv}
          disabled={loading || filteredRecords.length === 0}
        >
          <Download size={17} />
          Exporter en CSV
        </button>
      </section>

      <section className="reports-filter-panel" aria-label="Filtres du rapport">
        <div className="reports-filter-heading">
          <CalendarDays size={19} />
          <div>
            <h2>Période du rapport</h2>
            <p>Choisis les dates et, si nécessaire, un employé.</p>
          </div>
        </div>

        <div className="reports-presets">
          <button type="button" onClick={() => handlePreset("today")}>
            Aujourd'hui
          </button>
          <button type="button" onClick={() => handlePreset("week")}>
            7 derniers jours
          </button>
          <button type="button" onClick={() => handlePreset("month")}>
            Ce mois
          </button>
        </div>

        <div className="reports-filters">
          <label>
            <span>Date de début</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>

          <label>
            <span>Date de fin</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={today}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>

          <label className="reports-employee-filter">
            <span>Employé</span>
            <select
              value={selectedEmployee}
              onChange={(event) => setSelectedEmployee(event.target.value)}
            >
              <option value="all">Tous les employés</option>
              {employees.map((employee) => (
                <option key={employee.id} value={String(employee.id)}>
                  {employee.matricule
                    ? `${employee.matricule} — `
                    : ""}
                  {employee.first_name} {employee.last_name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="reports-apply-button"
            onClick={handleApplyFilters}
            disabled={loading || !dateFrom || !dateTo || dateFrom > dateTo}
          >
            <RefreshCw size={16} />
            Actualiser
          </button>
        </div>
      </section>

      {error && (
        <div className="reports-message reports-message-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => loadData()}>
            Réessayer
          </button>
        </div>
      )}

      {successMessage && !error && (
        <div className="reports-message reports-message-success" role="status">
          {successMessage}
        </div>
      )}

      <div className="reports-period-caption">
        Période : <strong>{formatDate(dateFrom)}</strong> au{" "}
        <strong>{formatDate(dateTo)}</strong>
        {selectedEmployee !== "all" && " · Employé sélectionné"}
      </div>

      <section className="reports-metrics" aria-label="Indicateurs du rapport">
        <article className="reports-metric-card">
          <div className="reports-metric-icon reports-icon-green">
            <CalendarDays size={21} />
          </div>
          <span className="reports-metric-label">Présences enregistrées</span>
          <strong>{loading ? "…" : summary.presenceCount}</strong>
          <small>Enregistrements avec une arrivée</small>
        </article>

        <article className="reports-metric-card">
          <div className="reports-metric-icon reports-icon-amber">
            <UserX size={21} />
          </div>
          <span className="reports-metric-label">Absences enregistrées</span>
          <strong>{loading ? "…" : summary.absenceCount}</strong>
          <small>
            {loading
              ? "Chargement…"
              : `${summary.justifiedCount} justifiée(s) · ${summary.unjustifiedCount} injustifiée(s)`}
          </small>
        </article>

        <article className="reports-metric-card">
          <div className="reports-metric-icon reports-icon-blue">
            <Clock3 size={21} />
          </div>
          <span className="reports-metric-label">Retards enregistrés</span>
          <strong>{loading ? "…" : summary.lateCount}</strong>
          <small>Arrivées après 08:20</small>
        </article>

        <article className="reports-metric-card">
          <div className="reports-metric-icon reports-icon-purple">
            <BarChart3 size={21} />
          </div>
          <span className="reports-metric-label">Temps travaillé cumulé</span>
          <strong>
            {loading ? "…" : formatDuration(summary.workedMinutes)}
          </strong>
          <small>À partir des durées calculées par StaffTrack</small>
        </article>
      </section>

      <section className="reports-panel">
        <div className="reports-panel-header">
          <div>
            <h2>Statistiques par employé</h2>
            <p>
              Comparaison des présences, heures, retards et absences
              enregistrées.
            </p>
          </div>

          <span className="reports-count">
            {loading ? "…" : `${employeeStats.length} employé(s)`}
          </span>
        </div>

        <div className="reports-table-wrapper">
          <table className="reports-table">
            <thead>
              <tr>
                <th>EMPLOYÉ</th>
                <th>DÉPARTEMENT</th>
                <th>PRÉSENCES</th>
                <th>TEMPS TRAVAILLÉ</th>
                <th>RETARDS</th>
                <th>ABS. JUSTIFIÉES</th>
                <th>ABS. INJUSTIFIÉES</th>
              </tr>
            </thead>

            <tbody>
              {employeeStats.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <div className="reports-employee-name">
                      <span className="reports-avatar">
                        {`${employee.name.split(" ")[0]?.[0] || ""}${
                          employee.name.split(" ").slice(-1)[0]?.[0] || ""
                        }`.toUpperCase()}
                      </span>
                      <span>
                        <strong>{employee.name}</strong>
                        <small>{employee.matricule}</small>
                      </span>
                    </div>
                  </td>
                  <td>{employee.department}</td>
                  <td>
                    <span className="reports-number">
                      {employee.presenceCount}
                    </span>
                  </td>
                  <td>{formatHours(employee.workedMinutes)}</td>
                  <td>
                    <span
                      className={
                        employee.lateCount > 0
                          ? "reports-pill reports-pill-late"
                          : "reports-pill"
                      }
                    >
                      {employee.lateCount}
                    </span>
                  </td>
                  <td>{employee.justifiedAbsences}</td>
                  <td>{employee.unjustifiedAbsences}</td>
                </tr>
              ))}

              {!loading && employeeStats.length === 0 && (
                <tr>
                  <td colSpan={7} className="reports-empty">
                    Aucun employé ne correspond à ce filtre.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={7} className="reports-empty">
                    Chargement des statistiques…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="reports-table-footer">
          <span>
            Les statistiques sont calculées à partir des enregistrements
            retournés par StaffTrack pour la période sélectionnée.
          </span>
        </div>
      </section>

      <section className="reports-panel reports-details-panel">
        <div className="reports-panel-header">
          <div>
            <h2>Détail des enregistrements</h2>
            <p>
              Consulte les horaires, les absences et les motifs disponibles.
            </p>
          </div>

          <span className="reports-count">
            {loading ? "…" : `${filteredRecords.length} ligne(s)`}
          </span>
        </div>

        <div className="reports-table-wrapper">
          <table className="reports-table">
            <thead>
              <tr>
                <th>DATE</th>
                <th>EMPLOYÉ</th>
                <th>ARRIVÉE</th>
                <th>DÉPART</th>
                <th>STATUT</th>
                <th>DURÉE</th>
                <th>MOTIF / NOTES</th>
              </tr>
            </thead>

            <tbody>
              {[...filteredRecords]
                .sort((a, b) => {
                  const dateComparison = String(b.attendance_date || "")
                    .localeCompare(String(a.attendance_date || ""));

                  return dateComparison ||
                    String(a.first_name || "").localeCompare(
                      String(b.first_name || ""),
                      "fr"
                    );
                })
                .map((record, index) => {
                  const employee = employees.find(
                    (item) =>
                      String(item.id) === String(record.employee_id)
                  );

                  const employeeName = employee
                    ? `${employee.first_name || ""} ${
                        employee.last_name || ""
                      }`.trim()
                    : `${record.first_name || ""} ${
                        record.last_name || ""
                      }`.trim();

                  const status = record.absence_type
                    ? getAbsenceLabel(record.absence_type)
                    : record.check_in && record.check_out
                      ? "Présence complète"
                      : record.check_in
                        ? "Départ manquant"
                        : "Enregistrement incomplet";

                  return (
                    <tr key={record.id ?? `${record.employee_id}-${record.attendance_date}-${index}`}>
                      <td>{formatDate(record.attendance_date)}</td>
                      <td>
                        <strong>{employeeName || "Employé inconnu"}</strong>
                        <small className="reports-cell-subtitle">
                          {employee?.matricule || record.matricule || "—"}
                        </small>
                      </td>
                      <td>{formatTime(record.check_in)}</td>
                      <td>{formatTime(record.check_out)}</td>
                      <td>
                        <span className="reports-status">{status}</span>
                        {isLate(record) && (
                          <small className="reports-late-label">Retard</small>
                        )}
                      </td>
                      <td>
                        {record.worked_minutes !== null &&
                        record.worked_minutes !== undefined &&
                        record.worked_minutes !== ""
                          ? formatDuration(record.worked_minutes)
                          : "—"}
                      </td>
                      <td>
                        {record.absence_reason ||
                          record.notes ||
                          "—"}
                      </td>
                    </tr>
                  );
                })}

              {!loading && filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="reports-empty">
                    Aucun enregistrement pour cette période.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={7} className="reports-empty">
                    Chargement des enregistrements…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="reports-footnote">
        <Users size={16} />
        <span>
          « Sans pointage » ne signifie pas automatiquement « absent ».
          Seules les absences explicitement enregistrées sont comptabilisées
          comme telles.
        </span>
      </div>
    </div>
  );
}

export default Reports;
