
import os
import sys
from pathlib import Path
from app.db.session import DATABASE_URL

import uvicorn
from alembic import command
from alembic.config import Config
from app.main import app


def get_resource_dir() -> Path:
    """Retourne le dossier contenant les ressources nÃ©cessaires."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)

    return Path(__file__).resolve().parent


def main() -> None:
    resource_dir = get_resource_dir()
    alembic_ini = resource_dir / "alembic.ini"

    if not alembic_ini.exists():
        raise FileNotFoundError(
            f"Fichier de configuration Alembic introuvable : {alembic_ini}"
        )

    # CrÃ©er ou mettre Ã  jour le schÃ©ma de la base de donnÃ©es.
    config = Config(str(alembic_ini))
    print("===== DIAGNOSTIC STAFFTRACK =====", flush=True)
    print("Fichier Alembic :", alembic_ini, flush=True)
    print("URL de la base :", DATABASE_URL, flush=True)
    print("Dossier des ressources :", resource_dir, flush=True)
    print("=================================", flush=True)
    command.upgrade(config, "head")

    # DÃ©marrer l'API locale.
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )


if __name__ == "__main__":
    main()
