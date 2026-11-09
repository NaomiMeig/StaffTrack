
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import "./EmployeeForm.css";

function EmployeeEditForm({ employee, onCancel, onSuccess }) {
  const [form, setForm] = useState({
    first_name: employee.first_name ?? "",
    last_name: employee.last_name ?? "",
    department: employee.department ?? "",
    job_title: employee.job_title ?? "",
    hire_date: employee.hire_date ?? "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setErrors((previous) => ({
      ...previous,
      [name]: "",
    }));

    setApiError("");
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.first_name.trim()) {
      nextErrors.first_name = "Le prénom est obligatoire.";
    }

    if (!form.last_name.trim()) {
      nextErrors.last_name = "Le nom est obligatoire.";
    }

    if (!form.hire_date) {
      nextErrors.hire_date = "La date d'embauche est obligatoire.";
    } else if (
      form.hire_date > new Date().toISOString().slice(0, 10)
    ) {
      nextErrors.hire_date =
        "La date d'embauche ne peut pas être dans le futur.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setApiError("");

    if (!validate()) return;

    setSubmitting(true);

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/employees/${employee.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            department: form.department.trim() || null,
            job_title: form.job_title.trim() || null,
            hire_date: form.hire_date,
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail = data?.detail;

        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((item) => item.msg).join(" ")
              : "Impossible de modifier cet employé.";

        throw new Error(message);
      }

      onSuccess(data);
    } catch (error) {
      setApiError(
        error instanceof TypeError
          ? "Impossible de joindre le serveur. Vérifiez que le backend fonctionne."
          : error.message || "Une erreur est survenue.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="employee-form-page">
      <button
        className="employee-back-button"
        type="button"
        onClick={onCancel}
        disabled={submitting}
      >
        <ArrowLeft size={17} />
        Retour à la fiche
      </button>

      <section className="employee-form-card">
        <div className="employee-form-heading">
          <span className="employee-form-icon">
            <Save size={25} />
          </span>

          <div>
            <div className="employees-eyebrow">
              GESTION DU PERSONNEL
            </div>
            <h1>Modifier un employé</h1>
            <p>
              Modifiez les informations de{" "}
              {employee.first_name} {employee.last_name}.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="employee-form-grid">
            <label className="employee-form-field">
              <span>Matricule</span>
              <input
                type="text"
                value={employee.matricule}
                disabled
              />
              <small>Le matricule ne peut pas être modifié.</small>
            </label>

            <label className="employee-form-field">
              <span>Date d'embauche *</span>
              <input
                type="date"
                name="hire_date"
                value={form.hire_date}
                onChange={handleChange}
                max={new Date().toISOString().slice(0, 10)}
                required
              />
              {errors.hire_date && (
                <small className="employee-form-api-error">
                  {errors.hire_date}
                </small>
              )}
            </label>

            <label className="employee-form-field">
              <span>Prénom *</span>
              <input
                type="text"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                required
              />
              {errors.first_name && (
                <small className="employee-form-api-error">
                  {errors.first_name}
                </small>
              )}
            </label>

            <label className="employee-form-field">
              <span>Nom *</span>
              <input
                type="text"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                required
              />
              {errors.last_name && (
                <small className="employee-form-api-error">
                  {errors.last_name}
                </small>
              )}
            </label>

            <label className="employee-form-field">
              <span>Département</span>
              <input
                type="text"
                name="department"
                value={form.department}
                onChange={handleChange}
              />
            </label>

            <label className="employee-form-field">
              <span>Poste occupé</span>
              <input
                type="text"
                name="job_title"
                value={form.job_title}
                onChange={handleChange}
              />
            </label>
          </div>

          {apiError && (
            <div className="employee-form-api-error" role="alert">
              {apiError}
            </div>
          )}

          <div className="employee-form-actions">
            <span className="employee-form-required">
              * Champs obligatoires
            </span>

            <div>
              <button
                className="employee-form-cancel"
                type="button"
                onClick={onCancel}
                disabled={submitting}
              >
                Annuler
              </button>

              <button
                className="employee-form-submit"
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? "Enregistrement..."
                  : "Enregistrer les modifications"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

export default EmployeeEditForm;
