
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  BarChart3,
  History as HistoryIcon,
  Settings,
  Bell,
  Search,
  ChevronDown,
  UserCheck,
  UserX,
  Clock3,
  ArrowUpRight,
  Leaf,
  Menu,
} from "lucide-react";

import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Employees from "./Employees";
import Attendance from "./Attendance";
import History from "./History";
import Reports from "./Reports";
const API_URL = "http://127.0.0.1:8000";

const navigation = [
  { label: "Tableau de bord", icon: LayoutDashboard },
  { label: "EmployÃ©s", icon: Users },
  { label: "PrÃ©sences", icon: CalendarCheck },
  { label: "Historique", icon: HistoryIcon },
  { label: "Rapports", icon: BarChart3 },
];

function getLocalDateISO(date = new Date()) {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return localDate.toISOString().slice(0, 10);
}

function getLastSevenDates() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - index);

    return getLocalDateISO(date);
  });
}

function formatTime(value) {
  if (!value) return "â€”";
  return String(value).slice(0, 5);
}

function formatDate(value) {
  if (!value) return "â€”";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function getInitials(employee) {
  return `${employee.first_name?.[0] || ""}${
    employee.last_name?.[0] || ""
  }`.toUpperCase() || "?";
}

function getAttendanceStatus(record) {
  if (record.check_in && record.check_out) {
    return {
      label: "TerminÃ©e",
      className: "status-present",
    };
  }

  if (record.check_in) {
    return {
      label: "En cours",
      className: "status-progress",
    };
  }

  return {
    label: "IncomplÃ¨te",
    className: "status-pending",
  };
}

function App() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState("today");
  const [notificationOpen, setNotificationOpen] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    setDashboardError("");

    try {
      const dates = getLastSevenDates();
      const todayISO = dates[0];

      const [employeesResponse, ...attendanceResponses] =
        await Promise.all([
          fetch(`${API_URL}/employees/?active_only=true`),
          ...dates.map((date) =>
            fetch(
              `${API_URL}/attendance/?attendance_date=${date}`
            )
          ),
        ]);

      if (!employeesResponse.ok) {
        throw new Error(
          "Impossible de rÃ©cupÃ©rer la liste des employÃ©s."
        );
      }

      if (attendanceResponses.some((response) => !response.ok)) {
        throw new Error(
          "Impossible de rÃ©cupÃ©rer les enregistrements de prÃ©sence."
        );
      }

      const employeesData = await employeesResponse.json();

      const attendanceLists = await Promise.all(
        attendanceResponses.map((response) => response.json())
      );

      if (
        !Array.isArray(employeesData) ||
        attendanceLists.some((list) => !Array.isArray(list))
      ) {
        throw new Error(
          "Le format des donnÃ©es reÃ§ues est inattendu."
        );
      }

      const allRecords = attendanceLists
        .flat()
        .filter((record) => dates.includes(record.attendance_date));

      setEmployees(employeesData);
      setAttendanceRecords(allRecords);
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? error.message
          : "Une erreur est survenue pendant le chargement."
      );
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const employeeById = new Map(
    employees.map((employee) => [employee.id, employee])
  );

  const todayISO = getLocalDateISO();

  const todayRecords = attendanceRecords.filter(
    (record) => record.attendance_date === todayISO
  );

  const presentEmployeeIds = new Set(
    todayRecords
      .filter((record) => record.check_in)
      .map((record) => record.employee_id)
  );

  const presentCount = presentEmployeeIds.size;

  const incompleteCount = todayRecords.filter(
    (record) => record.check_in && !record.check_out
  ).length;

  const lateCount = new Set(
    todayRecords
      .filter(
        (record) =>
          record.check_in &&
          formatTime(record.check_in) > "08:20"
      )
      .map((record) => record.employee_id)
  ).size;

  // Il s'agit d'employÃ©s sans arrivÃ©e enregistrÃ©e,
  // pas d'une confirmation officielle d'absence.
  const absentCount = Math.max(
    0,
    employees.length - presentCount
  );

  const periodRecords =
    period === "today"
      ? todayRecords
      : attendanceRecords.filter(
          (record) => record.attendance_date <= todayISO
        );

  const periodPresentIds = new Set(
    periodRecords
      .filter((record) => record.check_in)
      .map((record) => record.employee_id)
  );

  const periodPresentCount = periodPresentIds.size;

  const presencePercentage =
    employees.length > 0
      ? Math.round(
          (Math.min(periodPresentCount, employees.length) /
            employees.length) *
            100
        )
      : 0;

  const recentAttendance = [...attendanceRecords]
    .sort((a, b) => {
      const dateComparison = b.attendance_date.localeCompare(
        a.attendance_date
      );

      if (dateComparison !== 0) return dateComparison;

      return (b.check_in || "").localeCompare(a.check_in || "");
    })
    .filter((record) => employeeById.has(record.employee_id))
    .filter((record) => {
      const employee = employeeById.get(record.employee_id);
      const fullName =
        `${employee.first_name || ""} ${employee.last_name || ""}`
          .toLowerCase();

      const department = (employee.department || "").toLowerCase();
      const query = search.trim().toLowerCase();

      return (
        fullName.includes(query) ||
        department.includes(query)
      );
    })
    .slice(0, 5);

  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const statCards = [
    {
      label: "Effectif actif",
      value: employees.length,
      detail: "EmployÃ©s actifs",
      icon: Users,
      color: "green",
    },
    {
      label: "PrÃ©sents aujourd'hui",
      value: presentCount,
      detail: `Sur ${employees.length} employÃ©s actifs`,
      icon: UserCheck,
      color: "sage",
    },
    {
      label: "Sans arrivÃ©e enregistrÃ©e",
      value: absentCount,
      detail: "Ã€ vÃ©rifier",
      icon: UserX,
      color: "amber",
    },
    {
      label: "Ã€ complÃ©ter",
      value: incompleteCount,
      detail: "ArrivÃ©e sans dÃ©part",
      icon: Clock3,
      color: "blue",
    },
  ];


  const handleNavigation = (page, label) => {
    setCurrentPage(page);
    setSidebarOpen(false);
  };

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Fermer le menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="brand">
          <div className="brand-icon">
            <Leaf size={23} strokeWidth={2.2} />
          </div>

          <div className="brand-copy">
            <span className="brand-name">StaffTrack</span>
            <span className="brand-caption">
              Gestion du personnel
            </span>
          </div>
        </div>

        <div className="nav-section">
          <p className="nav-heading">ESPACE DE TRAVAIL</p>

          <nav
            className="navigation"
            aria-label="Navigation principale"
          >
            {navigation.map(({ label, icon: Icon }) => {
              const page = {
                "Tableau de bord": "dashboard",
                EmployÃ©s: "employees",
                PrÃ©sences: "attendance",
                Historique: "history",
                Rapports: "reports",
              }[label];

              const active = currentPage === page;

              return (
                <button
                  key={label}
                  className={`nav-link ${
                    active ? "nav-link-active" : ""
                  }`}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => handleNavigation(page, label)}
                >
                  <Icon size={19} strokeWidth={1.9} />
                  <span>{label}</span>

                </button>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <Settings size={18} />
            </div>

            <p className="help-title">Un espace organisÃ©</p>
            <p className="help-description">
              Retrouvez les informations du personnel au mÃªme endroit.
            </p>
          </div>

          <div className="sidebar-profile">
            <div className="profile-avatar">R</div>

            <div className="profile-info">
              <span className="profile-name">Responsable</span>
              <span className="profile-role">Administration</span>
            </div>

            <ChevronDown
              size={17}
              className="profile-chevron"
            />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              type="button"
              aria-label="Ouvrir le menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>

            <div className="breadcrumb">
              <span>StaffTrack</span>
              <span className="breadcrumb-separator">/</span>
              <strong>
                {{
                  dashboard: "Tableau de bord",
                  employees: "EmployÃ©s",
                  attendance: "PrÃ©sences",
                  history: "Historique",
                  reports: "Rapports",
                }[currentPage] || "Tableau de bord"}
              </strong>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="today-date">
              <CalendarCheck size={17} />
              <span>{today}</span>
            </div>

            <div className="notification-wrapper">
              <button
                className="icon-button notification-button"
                type="button"
                aria-label="Notifications"
                aria-expanded={notificationOpen}
                onClick={() =>
                  setNotificationOpen((previous) => !previous)
                }
              >
                <Bell size={19} />
                {incompleteCount > 0 && (
                  <span className="notification-dot" />
                )}
              </button>

              {notificationOpen && (
                <div className="notification-popover">
                  <strong>Notifications</strong>

                  {loadingDashboard ? (
                    <p>Chargement des informationsâ€¦</p>
                  ) : dashboardError ? (
                    <p>
                      Les notifications ne sont pas disponibles.
                    </p>
                  ) : incompleteCount > 0 ? (
                    <p>
                      {incompleteCount} prÃ©sence(s) avec une arrivÃ©e
                      sans dÃ©part aujourd'hui.
                    </p>
                  ) : (
                    <p>
                      Aucune prÃ©sence incomplÃ¨te dÃ©tectÃ©e aujourd'hui.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage("attendance");
                      setNotificationOpen(false);
                    }}
                  >
                    Consulter les prÃ©sences
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {currentPage === "employees" ? (
          <div className="dashboard-content">
            <Employees />
          </div>
        ) : currentPage === "attendance" ? (
          <div className="dashboard-content">
            <Attendance />
          </div>
        ) : currentPage === "history" ? (
          <div className="dashboard-content">
            <History />
          </div>
        ) : currentPage === "reports" ? (
          <div className="dashboard-content">
            <Reports />
         </div>
        ) : (
          <div className="dashboard-content">
            <section className="welcome-section">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-dot" />
                  VOTRE ESPACE DE GESTION
                </div>

                <h1>
                  Bonjour, Responsable <span>ðŸ‘‹</span>
                </h1>

                <p className="welcome-description">
                  Voici un aperÃ§u de l'activitÃ© de votre personnel.
                </p>
              </div>
            </section>

            {dashboardError && (
              <div role="alert" className="dashboard-error">
                <p>{dashboardError}</p>
                <button
                  type="button"
                  onClick={loadDashboard}
                  disabled={loadingDashboard}
                >
                  RÃ©essayer
                </button>
              </div>
            )}

            {!dashboardError && !loadingDashboard && (
              <p className="dashboard-data-note">
                DonnÃ©es chargÃ©es depuis StaffTrack.
              </p>
            )}

            <section
              className="stats-grid"
              aria-label="Indicateurs du personnel"
            >
              {statCards.map(
                ({ label, value, detail, icon: Icon, color }) => (
                  <article className="stat-card" key={label}>
                    <div className="stat-top">
                      <span className="stat-label">{label}</span>
                      <span className={`stat-icon stat-icon-${color}`}>
                        <Icon size={20} strokeWidth={1.9} />
                      </span>
                    </div>

                    <div className="stat-value">
                      {loadingDashboard ? "â€¦" : value}
                    </div>

                    <div className="stat-bottom">
                      <span className="stat-detail">{detail}</span>
                      <span className="stat-arrow">
                        <ArrowUpRight size={16} />
                      </span>
                    </div>
                  </article>
                )
              )}
            </section>

            <section className="overview-grid">
              <article className="panel attendance-summary">
                <div className="panel-header">
                  <div>
                    <h2>Vue des prÃ©sences</h2>
                    <p className="panel-subtitle">
                      RÃ©partition des arrivÃ©es enregistrÃ©es
                    </p>
                  </div>

                  <select
                    className="period-select"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value)}
                    aria-label="PÃ©riode des prÃ©sences"
                  >
                    <option value="today">Aujourd'hui</option>
                    <option value="week">7 derniers jours</option>
                  </select>
                </div>

                <div className="attendance-chart">
                  <div
                    className="donut-chart"
                    style={{
                      background: `conic-gradient(#648b72 ${
                        presencePercentage * 3.6
                      }deg, #e8eee8 0deg)`,
                    }}
                    role="img"
                    aria-label={`${presencePercentage}% de l'effectif a une arrivÃ©e enregistrÃ©e sur la pÃ©riode`}
                  >
                    <div className="donut-center">
                      <strong>
                        {loadingDashboard
                          ? "â€¦"
                          : `${presencePercentage}%`}
                      </strong>
                      <span>PrÃ©sence</span>
                    </div>
                  </div>

                  <div className="chart-legend">
                    <div className="legend-row">
                      <span className="legend-dot legend-present" />
                      <span>EmployÃ©s avec arrivÃ©e</span>
                      <strong>
                        {loadingDashboard ? "â€¦" : periodPresentCount}
                      </strong>
                    </div>

                    <div className="legend-row">
                      <span className="legend-dot legend-absent" />
                      <span>Sans arrivÃ©e enregistrÃ©e</span>
                      <strong>
                        {loadingDashboard
                          ? "â€¦"
                          : Math.max(
                              0,
                              employees.length - periodPresentCount
                            )}
                      </strong>
                    </div>

                    <div className="legend-row">
                      <span className="legend-dot legend-pending" />
                      <span>ArrivÃ©es tardives aujourd'hui</span>
                      <strong>
                        {loadingDashboard ? "â€¦" : lateCount}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="chart-note">
                  <Clock3 size={15} />
                  <span>
                    {period === "today"
                      ? "DonnÃ©es du jour"
                      : "DonnÃ©es rÃ©cupÃ©rÃ©es sur les 7 derniers jours"}
                  </span>
                </div>
              </article>

              <article className="panel quick-panel">
                <div className="panel-header">
                  <div>
                    <h2>AccÃ¨s rapide</h2>
                    <p className="panel-subtitle">
                      Les actions les plus courantes
                    </p>
                  </div>
                </div>

                <button
                  className="quick-action"
                  type="button"
                  onClick={() => setCurrentPage("employees")}
                >
                  <span className="quick-action-icon quick-green">
                    <Users size={20} />
                  </span>
                  <span className="quick-action-copy">
                    <strong>GÃ©rer les employÃ©s</strong>
                    <span>Consulter les fiches du personnel</span>
                  </span>
                  <ArrowUpRight size={17} className="quick-arrow" />
                </button>

                <button
                  className="quick-action"
                  type="button"
                  onClick={() => setCurrentPage("attendance")}
                >
                  <span className="quick-action-icon quick-sage">
                    <CalendarCheck size={20} />
                  </span>
                  <span className="quick-action-copy">
                    <strong>Saisir les prÃ©sences</strong>
                    <span>Enregistrer les horaires du jour</span>
                  </span>
                  <ArrowUpRight size={17} className="quick-arrow" />
                </button>

                <button
                  className="quick-action"
                  type="button"
                  onClick={() => setCurrentPage("history")}
                >
                  <span className="quick-action-icon quick-lilac">
                    <HistoryIcon size={20} />
                  </span>
                  <span className="quick-action-copy">
                    <strong>Voir les corrections</strong>
                    <span>
                      Consulter l'historique des modifications
                    </span>
                  </span>
                  <ArrowUpRight size={17} className="quick-arrow" />
                </button>
              </article>
            </section>

            <section className="panel recent-panel">
              <div className="panel-header recent-header">
                <div>
                  <h2>DerniÃ¨res prÃ©sences</h2>
                  <p className="panel-subtitle">
                    Enregistrements rÃ©els des 7 derniers jours
                  </p>
                </div>

                <label className="search-field">
                  <Search size={17} />
                  <input
                    type="search"
                    placeholder="Rechercher un employÃ©..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label="Rechercher dans les prÃ©sences"
                  />
                </label>
              </div>

              <div className="table-wrapper">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>EMPLOYÃ‰</th>
                      <th>DÃ‰PARTEMENT</th>
                      <th>ARRIVÃ‰E</th>
                      <th>DÃ‰PART</th>
                      <th>STATUT</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentAttendance.map((record) => {
                      const employee = employeeById.get(
                        record.employee_id
                      );
                      const status = getAttendanceStatus(record);

                      return (
                        <tr key={record.id}>
                          <td>
                            <div className="employee-cell">
                              <span className="employee-avatar avatar-green">
                                {getInitials(employee)}
                              </span>

                              <span className="employee-name">
                                {employee.first_name} {employee.last_name}
                              </span>
                            </div>
                          </td>

                          <td className="department-cell">
                            {employee.department || "â€”"}
                          </td>

                          <td className="time-cell">
                            {formatTime(record.check_in)}
                          </td>

                          <td className="time-cell">
                            {formatTime(record.check_out)}
                          </td>

                          <td>
                            <span
                              className={`status-badge ${status.className}`}
                              title={`Date : ${formatDate(
                                record.attendance_date
                              )}`}
                            >
                              <span className="status-dot" />
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {recentAttendance.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty-state">
                          {loadingDashboard
                            ? "Chargement des prÃ©sencesâ€¦"
                            : search
                              ? `Aucun rÃ©sultat pour Â« ${search} Â».`
                              : "Aucune prÃ©sence enregistrÃ©e sur les 7 derniers jours."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                <span>
                  {recentAttendance.length} ligne(s) affichÃ©e(s)
                  {" "}sur les 5 derniÃ¨res prÃ©sences
                </span>

                <span className="demo-footer-label">
                  <span className="demo-indicator-dot" />
                  DonnÃ©es rÃ©elles
                </span>
              </div>
            </section>

            <footer className="dashboard-footer">
              <span>
                StaffTrack{" "}
                <span className="footer-separator">Â·</span>{" "}
                Gestion du personnel
              </span>

              <span>
                Application locale{" "}
                <span className="footer-separator">Â·</span>{" "}
                Version de dÃ©veloppement
              </span>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
