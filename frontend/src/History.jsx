
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Clock3,
  RefreshCw,
  Download,
  AlertCircle,
  History as HistoryIcon,
  Pencil,
  Users,
} from "lucide-react";

import "./Attendance.css";
import "./History.css";

const API = "http://127.0.0.1:8000";

const PRESETS = [
  { id: "7d", label: "7 derniers jours" },
  { id: "30d", label: "30 derniers jours" },
  { id: "month", label: "Mois en cours" },
  { id: "prev", label: "Mois précédent" },
];

// Affiche proprement les valeurs vides et les chaînes de test.
const displayValue = (value) => {
  if (value === null || value === undefined) return "—";

  const text = String(value).trim();

  if (
    text === "" ||
    ["string", "null", "undefined"].includes(text.toLowerCase())
  ) {
    return "—";
  }

  return text;
};

const toISO = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const getPresetRange = (preset) => {
  const now = new Date();
  now.setHours(12, 0, 0, 0);

  let start = new Date(now);
  let end = new Date(now);

  if (preset === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "30d") {
    start.setDate(start.getDate() - 29);
  } else if (preset === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  } else if (preset === "prev") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 12);
  }

  return { from: toISO(start), to: toISO(end) };
};

const formatTime = (value) => {
  const text = displayValue(value);
  return text === "—" ? "—" : text.slice(0, 5);
};

const formatDate = (iso) => {
  if (!iso) return "—";

  const date = new Date(`${iso}T12:00:00`);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
};

const formatDuration = (minutes) => {
  if (
    minutes === null ||
    minutes === undefined ||
    !Number.isFinite(Number(minutes))
  ) {
    return "—";
  }

  const total = Math.max(0, Number(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;

  return `${hours} h ${String(rest).padStart(2, "0")}`;
};

const formatDurationCsv = (minutes) => {
  if (
    minutes === null ||
    minutes === undefined ||
    !Number.isFinite(Number(minutes))
  ) {
    return "";
  }

  const total = Math.max(0, Number(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;

  return `${hours}:${String(rest).padStart(2, "0")}`;
};

// Les dates du serveur sont en UTC sans fuseau : on force le "Z".
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

const errorMessage = (data, fallback) => {
  const detail = data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    return detail[0].msg.replace(/^Value error,\s*/i, "");
  }

  return fallback;
};

const fieldLabel = (field) => {
  const labels = {
    check_in: "Heure d'arrivée",
    check_out: "Heure de départ",
    notes: "Notes",
    department: "Département",
    absence_type: "Type d'absence",
    absence_reason: "Motif de l'absence",
    status: "Statut",
    attendance_date: "Date",
  };

  return labels[field] || displayValue(field);
};

const formatCorrectionValue = (field, value) => {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === "" ||
    ["string", "null", "undefined"].includes(
      String(value).trim().toLowerCase()
    )
  ) {
    return "—";
  }

  if (field === "check_in" || field === "check_out") {
    return formatTime(value);
  }

  if (field === "absence_type") {
    const type = String(value).trim().toLowerCase();

    if (type === "justifie") return "Absence justifiée";
    if (type === "injustifie") return "Absence injustifiée";
  }

  return displayValue(value);
};

const fullName = (item) =>
  [displayValue(item.first_name), displayValue(item.last_name)]
    .filter((value) => value !== "—")
    .join(" ") || "Employé inconnu";

const initialsOf = (item) =>
  `${item.first_name?.[0] || ""}${item.last_name?.[0] || ""}`.toUpperCase() ||
  "?";

const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Séparateur ";" et BOM UTF-8 pour Excel en français.
const downloadCsv = (filename, rows) => {
  const content =
    "\uFEFF" + rows.map((row) => row.map(csvEscape).join(";")).join("\r\n");

  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
};

function History({ initialTab = "records" }) {
  const [tab, setTab] = useState(initialTab);
  const [preset, setPreset] = useState("month");
  const [dateFrom, setDateFrom] = useState(
    () => getPresetRange("month").from
  );
  const [dateTo, setDateTo] = useState(() => getPresetRange("month").to);
  const [employeeId, setEmployeeId] = useState("");

  const [records, setRecords] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const abortRef = useRef(null);

  const rangeError =
    dateFrom && dateTo && dateFrom > dateTo
      ? "La date de début doit être antérieure à la date de fin."
      : "";

  const loadData = useCallback(async () => {
    abortRef.current?.abort();

    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    const params = `date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;

    try {
      const [recordsResponse, correctionsResponse] = await Promise.all([
        fetch(`${API}/attendance/report?${params}`, {
          signal: controller.signal,
        }),
        fetch(`${API}/attendance/corrections?${params}`, {
          signal: controller.signal,
        }),
      ]);

      const recordsData = await recordsResponse.json().catch(() => null);
      const correctionsData = await correctionsResponse
        .json()
        .catch(() => null);

      if (controller.signal.aborted) return;

      if (!recordsResponse.ok) {
        throw new Error(
          errorMessage(recordsData, "Impossible de charger les présences.")
        );
      }

      if (!correctionsResponse.ok) {
        throw new Error(
          errorMessage(
            correctionsData,
            "Impossible de charger les corrections."
          )
        );
      }

      if (!Array.isArray(recordsData) || !Array.isArray(correctionsData)) {
        throw new Error(
          "Le serveur a retourné un format de données inattendu."
        );
      }

      setRecords(recordsData);
      setCorrections(correctionsData);
    } catch (err) {
      if (err?.name === "AbortError") return;

      setError(
        err instanceof TypeError
          ? "Impossible de joindre l'API. Vérifiez que le backend est démarré."
          : err.message || "Une erreur est survenue."
      );

      setRecords([]);
      setCorrections([]);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadData();
    return () => abortRef.current?.abort();
  }, [loadData]);

  const employeeOptions = useMemo(() => {
    const map = new Map();

    for (const item of [...records, ...corrections]) {
      if (!map.has(item.employee_id)) {
        map.set(item.employee_id, {
          id: item.employee_id,
          name: fullName(item),
          matricule: displayValue(item.matricule),
          isActive: item.is_active,
        });
      }
    }

    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "fr")
    );
  }, [records, corrections]);

  // Retire le filtre si l'employé n'a plus de données sur la période.
  useEffect(() => {
    if (loading || error || !employeeId) return;

    if (!employeeOptions.some((option) => String(option.id) === employeeId)) {
      setEmployeeId("");
    }
  }, [loading, error, employeeId, employeeOptions]);

  const selectedId = employeeId ? Number(employeeId) : null;

  const filteredRecords = useMemo(
    () =>
      selectedId
        ? records.filter((item) => item.employee_id === selectedId)
        : records,
    [records, selectedId]
  );

  const filteredCorrections = useMemo(
    () =>
      selectedId
        ? corrections.filter((item) => item.employee_id === selectedId)
        : corrections,
    [corrections, selectedId]
  );

  const today = toISO(new Date());

  const summary = useMemo(() => {
    let totalMinutes = 0;
    let missingCheckOut = 0;
    let corrected = 0;

    for (const item of filteredRecords) {
      if (Number.isFinite(Number(item.worked_minutes))) {
        totalMinutes += Number(item.worked_minutes);
      }

      if (
        !item.absence_type &&
        item.check_in &&
        !item.check_out &&
        item.attendance_date < today
      ) {
        missingCheckOut += 1;
      }

      if (Number(item.corrections_count) > 0) corrected += 1;
    }

    return {
      days: filteredRecords.length,
      totalMinutes,
      missingCheckOut,
      corrected,
    };
  }, [filteredRecords, today]);

  const statusOf = (item) => {
    if (item.absence_type === "justifie") {
      return {
        label: "Absence justifiée",
        className: "status-absence-justifie",
      };
    }

    if (item.absence_type === "injustifie") {
      return {
        label: "Absence injustifiée",
        className: "status-absence-injustifie",
      };
    }

    if (item.check_in && item.check_out) {
      return { label: "Terminé", className: "status-done" };
    }

    if (item.check_in) {
      return item.attendance_date < today
        ? { label: "Départ manquant", className: "status-absent" }
        : { label: "En cours", className: "status-open" };
    }

    return { label: "Sans arrivée", className: "status-absent" };
  };

  const choosePreset = (id) => {
    const range = getPresetRange(id);
    setPreset(id);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const exportCsv = () => {
    if (tab === "records") {
      downloadCsv(`presences_${dateFrom}_${dateTo}.csv`, [
        [
          "Date",
          "Matricule",
          "Nom complet",
          "Département",
          "Arrivée",
          "Départ",
          "Durée (h:mm)",
          "Statut",
          "Motif / Notes",
          "Corrections",
        ],
        ...filteredRecords.map((item) => [
          formatDate(item.attendance_date),
          displayValue(item.matricule),
          fullName(item),
          displayValue(item.department),
          formatTime(item.check_in),
          formatTime(item.check_out),
          formatDurationCsv(item.worked_minutes),
          statusOf(item).label,
          displayValue(item.absence_reason || item.notes),
          item.corrections_count ?? 0,
        ]),
      ]);
    } else {
      downloadCsv(`corrections_${dateFrom}_${dateTo}.csv`, [
        [
          "Corrigé le",
          "Matricule",
          "Nom complet",
          "Jour concerné",
          "Champ",
          "Ancienne valeur",
          "Nouvelle valeur",
          "Motif",
          "Auteur",
        ],
        ...filteredCorrections.map((item) => [
          formatServerDateTime(item.corrected_at),
          displayValue(item.matricule),
          fullName(item),
          formatDate(item.attendance_date),
          fieldLabel(item.field_name),
          formatCorrectionValue(item.field_name, item.old_value),
          formatCorrectionValue(item.field_name, item.new_value),
          displayValue(item.reason),
          displayValue(item.author),
        ]),
      ]);
    }
  };

  const currentCount =
    tab === "records" ? filteredRecords.length : filteredCorrections.length;

  return (
    <div className="attendance-page">
      <section className="attendance-heading">
        <div>
          <div className="attendance-eyebrow">
            <span />
            CONSULTATION
          </div>
          <h1>Historique</h1>
          <p>Consultez les présences passées et le journal des corrections.</p>
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

      <section className="history-filters" aria-label="Filtres">
        <div className="history-presets" role="group" aria-label="Période">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`history-chip ${preset === item.id ? "is-active" : ""}`}
              onClick={() => choosePreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="history-filter-row">
          <label className="attendance-date-field">
            <CalendarDays size={18} />
            <span>Du</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => {
                setPreset("custom");
                setDateFrom(event.target.value);
              }}
            />
          </label>

          <label className="attendance-date-field">
            <CalendarDays size={18} />
            <span>Au</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => {
                setPreset("custom");
                setDateTo(event.target.value);
              }}
            />
          </label>

          <label className="attendance-date-field">
            <Users size={18} />
            <span>Employé</span>
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              <option value="">Tous les employés</option>
              {employeeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.matricule})
                  {option.isActive ? " " : " — inactif"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {rangeError && (
        <div className="attendance-notice notice-error" role="alert">
          <AlertCircle size={19} />
          <span>{rangeError}</span>
        </div>
      )}

      <section className="attendance-metrics">
        <article>
          <span className="attendance-metric-icon metric-total">
            <CalendarCheck size={19} />
          </span>
          <div>
            <span>Fiches sur la période</span>
            <strong>{loading ? "…" : summary.days}</strong>
          </div>
        </article>

        <article>
          <span className="attendance-metric-icon metric-present">
            <Clock3 size={19} />
          </span>
          <div>
            <span>Heures travaillées</span>
            <strong>
              {loading ? "…" : formatDuration(summary.totalMinutes)}
            </strong>
          </div>
        </article>

        <article>
          <span className="attendance-metric-icon metric-missing">
            <AlertCircle size={19} />
          </span>
          <div>
            <span>Départs manquants</span>
            <strong>{loading ? "…" : summary.missingCheckOut}</strong>
          </div>
        </article>

        <article>
          <span className="attendance-metric-icon metric-pending">
            <Pencil size={19} />
          </span>
          <div>
            <span>Fiches corrigées</span>
            <strong>{loading ? "…" : summary.corrected}</strong>
          </div>
        </article>
      </section>

      <div
        className="history-tabs"
        role="tablist"
        aria-label="Sections de l'historique"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "records"}
          className={`history-tab ${tab === "records" ? "is-active" : ""}`}
          onClick={() => setTab("records")}
        >
          Présences
          <span className="history-tab-count">
            {loading ? "…" : filteredRecords.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "corrections"}
          className={`history-tab ${tab === "corrections" ? "is-active" : ""}`}
          onClick={() => setTab("corrections")}
        >
          Corrections
          <span className="history-tab-count">
            {loading ? "…" : filteredCorrections.length}
          </span>
        </button>
      </div>

      <section className="attendance-panel">
        <div className="attendance-panel-header">
          <div>
            <h2>
              {tab === "records"
                ? "Registre des présences"
                : "Journal des corrections"}
            </h2>
            <p>
              Du {formatDate(dateFrom)} au {formatDate(dateTo)}
            </p>
          </div>

          <button
            className="attendance-refresh"
            type="button"
            onClick={exportCsv}
            disabled={loading || Boolean(error) || currentCount === 0}
            title="Exporter en CSV (ouvrable dans Excel)"
          >
            <Download size={16} />
            Exporter en CSV
          </button>
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
            <p>Chargement de l'historique…</p>
          </div>
        ) : rangeError ? (
          <div className="attendance-empty">
            <CalendarDays size={27} />
            <p>Corrigez la période pour afficher les données.</p>
          </div>
        ) : currentCount === 0 ? (
          <div className="attendance-empty">
            <HistoryIcon size={27} />
            <strong>
              {tab === "records" ? "Aucune présence" : "Aucune correction"}
            </strong>
            <p>Aucune donnée pour cette période et ce filtre.</p>
          </div>
        ) : tab === "records" ? (
          <div className="attendance-table-wrap">
            <table className="attendance-real-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>EMPLOYÉ</th>
                  <th>DÉPARTEMENT</th>
                  <th>ARRIVÉE</th>
                  <th>DÉPART</th>
                  <th>DURÉE</th>
                  <th>STATUT</th>
                  <th>MOTIF / NOTES</th>
                  <th>CORRECTIONS</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map((item) => {
                  const status = statusOf(item);

                  return (
                    <tr key={item.id}>
                      <td className="attendance-time">
                        {formatDate(item.attendance_date)}
                      </td>

                      <td>
                        <div className="attendance-employee">
                          <span className="attendance-avatar">
                            {initialsOf(item)}
                          </span>
                          <div>
                            <strong>{fullName(item)}</strong>
                            <span>{displayValue(item.matricule)}</span>
                          </div>
                        </div>
                      </td>

                      <td>{displayValue(item.department)}</td>

                      <td className="attendance-time">
                        {formatTime(item.check_in)}
                      </td>

                      <td className="attendance-time">
                        {formatTime(item.check_out)}
                      </td>

                      <td className="attendance-time">
                        {formatDuration(item.worked_minutes)}
                      </td>

                      <td>
                        <span
                          className={`attendance-status ${status.className}`}
                        >
                          <span />
                          {status.label}
                        </span>
                      </td>

                      <td>{displayValue(item.absence_reason || item.notes)}</td>

                      <td>
                        {item.corrections_count > 0 ? (
                          <span className="history-badge">
                            <Pencil size={11} />
                            {item.corrections_count}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="attendance-table-wrap">
            <table className="attendance-real-table">
              <thead>
                <tr>
                  <th>CORRIGÉ LE</th>
                  <th>EMPLOYÉ</th>
                  <th>JOUR CONCERNÉ</th>
                  <th>CHAMP</th>
                  <th>MODIFICATION</th>
                  <th>MOTIF</th>
                  <th>AUTEUR</th>
                </tr>
              </thead>

              <tbody>
                {filteredCorrections.map((item) => (
                  <tr key={item.id}>
                    <td className="attendance-time">
                      {formatServerDateTime(item.corrected_at)}
                    </td>

                    <td>
                      <div className="attendance-employee">
                        <span className="attendance-avatar">
                          {initialsOf(item)}
                        </span>
                        <div>
                          <strong>{fullName(item)}</strong>
                          <span>{displayValue(item.matricule)}</span>
                        </div>
                      </div>
                    </td>

                    <td className="attendance-time">
                      {formatDate(item.attendance_date)}
                    </td>

                    <td>{fieldLabel(item.field_name)}</td>

                    <td className="history-change">
                      <span>
                        {formatCorrectionValue(
                          item.field_name,
                          item.old_value
                        )}
                      </span>{" "}
                      →{" "}
                      <strong>
                        {formatCorrectionValue(
                          item.field_name,
                          item.new_value
                        )}
                      </strong>
                    </td>

                    <td className="history-reason">
                      {displayValue(item.reason)}
                    </td>

                    <td>{displayValue(item.author)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="attendance-table-footer">
          <span>
            {loading
              ? "Chargement…"
              : tab === "records"
                ? `${filteredRecords.length} fiche(s) · ${formatDuration(summary.totalMinutes)} au total`
                : `${filteredCorrections.length} correction(s)`}
          </span>

          <span>
            {tab === "records"
              ? "Durée = départ − arrivée − pause de 60 min."
              : "Les saisies manuelles apparaissent aussi dans ce journal."}
          </span>
        </div>
      </section>
    </div>
  );
}

export default History;
