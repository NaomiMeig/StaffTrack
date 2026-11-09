
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import "./ConfirmDialog.css";

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      className="confirm-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onCancel();
        }
      }}
    >
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <button
          className="confirm-dialog-close"
          type="button"
          onClick={onCancel}
          disabled={loading}
          aria-label="Fermer"
        >
          <X size={19} />
        </button>

        <div
          className={`confirm-dialog-icon ${
            isDanger ? "confirm-dialog-icon-danger" : "confirm-dialog-icon-success"
          }`}
        >
          {isDanger ? (
            <AlertTriangle size={27} />
          ) : (
            <CheckCircle2 size={27} />
          )}
        </div>

        <h2 id="confirm-dialog-title">{title}</h2>

        <p id="confirm-dialog-message">{message}</p>

        <div className="confirm-dialog-actions">
          <button
            className="confirm-dialog-cancel"
            type="button"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>

          <button
            className={`confirm-dialog-confirm ${
              isDanger
                ? "confirm-dialog-confirm-danger"
                : "confirm-dialog-confirm-success"
            }`}
            type="button"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Veuillez patienter…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ConfirmDialog;
