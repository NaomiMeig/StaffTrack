
import { useState } from "react";
import { ArrowLeft, UserRoundPlus } from "lucide-react";
import "./EmployeeForm.css";

const initialForm = {
  matricule: "",
  first_name: "",
  last_name: "",
  department: "",
  job_title: "",
  hire_date: new Date().toISOString().slice(0, 10),
};

function EmployeeForm({ onCancel, onSuccess }) {
  const [form, setForm] = useState(initialForm);
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

    if (!form.matricule.trim()) {
      nextErrors.matricule = "Le matricule est obligatoire.";
    }

    if (!form.first_name.trim()) {
      nextErrors.first_name = "Le prénom est obligatoire.";
    }

    if (!form.last_name.trim()) {
      nextErrors.last_name = "Le nom est obligatoire.";
    }

    if (!form.department.trim()) {
      nextErrors.department = "Le département est obligatoire.";
    }

    if (!form.job_title.trim()) {
      nextErrors.job_title = "Le poste est obligatoire.";
    }

    if (!form.hire_date) {
      nextErrors.hire_date = "La date d'embauche est obligatoire.";
    } else if (form.hire_date > new Date().toISOString().slice(0, 10)) {
      nextErrors.hire_date =
        "La date d'embauche ne peut pas être dans le futur.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setApiError("");

    if (!validate()) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("http://127.0.0.1:8000/employees/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matricule: form.matricule.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          department: form.department.trim(),
          job_title: form.job_title.trim(),
          hire_date: form.hire_date,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail = data?.detail;
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((item) => item.msg).join(" ")
              : "Impossible d'enregistrer cet employé.";

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
        Retour à la liste
      </button>

      <section className="employee-form-card">
        <div className="employee-form-heading">
          <span className="employee-form-icon">
            <UserRoundPlus size={25} />
          </span>

          <div>
            <div className="employees-eyebrow">GESTION DU PERSONNEL</div>
            <h1>Ajouter un employé</h1>
            <p>Renseignez les informations du nouvel employé.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="employee-form-grid">
            <div className="employee-form-field">
              <label htmlFor="matricule">Matricule *</label>
              <input
                id="matricule"
                name="matricule"
                value={form.matricule}
                onChange={handleChange}
                placeholder="Ex. ST002"
                aria-invalid={Boolean(errors.matricule)}
                aria-describedby={errors.matricule ? "matricule-error" : undefined}
              />
              {errors.matricule && (
                <span id="matricule-error" className="employee-field-error">
                  {errors.matricule}
                </span>
              )}
            </div>

            <div className="employee-form-field">
              <label htmlFor="hire_date">Date d'embauche *</label>
              <input
                id="hire_date"
                name="hire_date"
                type="date"
                value={form.hire_date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={handleChange}
                aria-invalid={Boolean(errors.hire_date)}
              />
              {errors.hire_date && (
                <span className="employee-field-error">
                  {errors.hire_date}
                </span>
              )}
            </div>

            <div className="employee-form-field">
              <label htmlFor="first_name">Prénom *</label>
              <input
                id="first_name"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                placeholder="Ex. Amina"
                aria-invalid={Boolean(errors.first_name)}
              />
              {errors.first_name && (
                <span className="employee-field-error">
                  {errors.first_name}
                </span>
              )}
            </div>

            <div className="employee-form-field">
              <label htmlFor="last_name">Nom *</label>
              <input
                id="last_name"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                placeholder="Ex. Diallo"
                aria-invalid={Boolean(errors.last_name)}
              />
              {errors.last_name && (
                <span className="employee-field-error">
                  {errors.last_name}
                </span>
              )}
            </div>

            <div className="employee-form-field">
              <label htmlFor="department">Département *</label>
              <input
                id="department"
                name="department"
                value={form.department}
                onChange={handleChange}
                placeholder="Ex. Administration"
                aria-invalid={Boolean(errors.department)}
              />
              {errors.department && (
                <span className="employee-field-error">
                  {errors.department}
                </span>
              )}
            </div>

            <div className="employee-form-field">
              <label htmlFor="job_title">Poste occupé *</label>
              <input
                id="job_title"
                name="job_title"
                value={form.job_title}
                onChange={handleChange}
                placeholder="Ex. Assistante"
                aria-invalid={Boolean(errors.job_title)}
              />
              {errors.job_title && (
                <span className="employee-field-error">
                  {errors.job_title}
                </span>
              )}
            </div>
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
                {submitting ? "Enregistrement..." : "Enregistrer l'employé"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

export default EmployeeForm;
