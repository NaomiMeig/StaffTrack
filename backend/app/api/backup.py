
from contextlib import closing
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
import sqlite3
import os


from fastapi import File, UploadFile
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import text

from app.db.session import DATA_DIR, engine


router = APIRouter(prefix="/backup", tags=["Sauvegarde"])


@router.get("/export")
def exporter_sauvegarde():
    """
    Crée une copie cohérente de la base SQLite
    et la renvoie sous forme de fichier téléchargeable.
    """
    database_path = DATA_DIR / "stafftrack.db"

    if not database_path.exists():
        raise HTTPException(
            status_code=404,
            detail="La base de données StaffTrack est introuvable.",
        )

    temp_path = None

    try:
        # Le moteur termine les opérations en cours et libère
        # les connexions avant la copie SQLite.
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        with NamedTemporaryFile(
            prefix="stafftrack_backup_",
            suffix=".db",
            delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)

        # L'API de sauvegarde SQLite produit une copie cohérente,
        # même si l'application utilise la base en parallèle.
        with sqlite3.connect(str(database_path)) as source:
            with sqlite3.connect(str(temp_path)) as destination:
                source.backup(destination)

                result = destination.execute(
                    "PRAGMA integrity_check"
                ).fetchone()

                if not result or result[0] != "ok":
                    raise RuntimeError(
                        "La vérification de la sauvegarde a échoué."
                    )

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"stafftrack_sauvegarde_{timestamp}.db"

        return FileResponse(
            path=str(temp_path),
            media_type="application/octet-stream",
            filename=filename,
            background=None,
        )

    except Exception as exc:
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)

        if isinstance(exc, HTTPException):
            raise

        raise HTTPException(
            status_code=500,
            detail=f"Impossible de créer la sauvegarde : {exc}",
        ) from exc


@router.post("/restore")
def restaurer_sauvegarde(file: UploadFile = File(...)):
    """
    Restaure une sauvegarde SQLite après vérification.
    Une copie de sécurité de la base actuelle est créée
    avant tout remplacement.
    """
    database_path = DATA_DIR / "stafftrack.db"
    backup_dir = DATA_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    uploaded_path = None
    safety_path = None
    restored = False

    try:
        # La base actuelle doit exister pour permettre
        # une restauration protégée.
        if not database_path.exists():
            raise HTTPException(
                status_code=404,
                detail="La base actuelle est introuvable.",
            )

        # Enregistrer le fichier reçu dans le dossier de données.
        with NamedTemporaryFile(
            prefix="restore_upload_",
            suffix=".db",
            dir=DATA_DIR,
            delete=False,
        ) as temp_file:
            uploaded_path = Path(temp_file.name)

            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                temp_file.write(chunk)

        # Vérifier que le fichier est une base SQLite valide.
        try:
            with closing(sqlite3.connect(str(uploaded_path))) as candidate:
                integrity = candidate.execute(
                    "PRAGMA integrity_check"
                ).fetchone()

                if not integrity or integrity[0] != "ok":
                    raise HTTPException(
                        status_code=400,
                        detail="La sauvegarde SQLite est endommagée.",
                    )

                candidate_tables = {
                    row[0]
                    for row in candidate.execute(
                        """
                        SELECT name FROM sqlite_master
                        WHERE type = 'table'
                        AND name NOT LIKE 'sqlite_%'
                        """
                    ).fetchall()
                }

                with closing(sqlite3.connect(str(database_path))) as current:
                    current_tables = {
                        row[0]
                        for row in current.execute(
                            """
                            SELECT name FROM sqlite_master
                            WHERE type = 'table'
                            AND name NOT LIKE 'sqlite_%'
                            """
                        ).fetchall()
                    }

                    if not current_tables:
                        raise HTTPException(
                            status_code=400,
                            detail="La base actuelle ne contient aucune table.",
                        )

                    if candidate_tables != current_tables:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                "Cette sauvegarde ne correspond pas "
                                "au schéma actuel de StaffTrack. "
                                "Aucune donnée n'a été remplacée."
                            ),
                        )

                    # Vérifier les colonnes de chaque table.
                    for table in current_tables:
                        current_columns = [
                            row[1]
                            for row in current.execute(
                                f'PRAGMA table_info("{table}")'
                            ).fetchall()
                        ]
                        candidate_columns = [
                            row[1]
                            for row in candidate.execute(
                                f'PRAGMA table_info("{table}")'
                            ).fetchall()
                        ]

                        if current_columns != candidate_columns:
                            raise HTTPException(
                                status_code=400,
                                detail=(
                                    f"Structure incompatible pour la table "
                                    f"{table}. Aucune donnée n'a été remplacée."
                                ),
                            )

        except sqlite3.DatabaseError as exc:
            raise HTTPException(
                status_code=400,
                detail="Le fichier fourni n'est pas une sauvegarde SQLite valide.",
            ) from exc

        # Créer une copie de sécurité de la base actuelle.
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safety_path = backup_dir / f"avant_restauration_{timestamp}.db"

        with closing(sqlite3.connect(str(database_path))) as current:
            with closing(sqlite3.connect(str(safety_path))) as safety:
                current.backup(safety)

        # Libérer les connexions SQLAlchemy avant remplacement.
        engine.dispose()

        # Remplacement atomique sur le même volume.
        os.replace(uploaded_path, database_path)
        restored = True
        uploaded_path = None
        return {
            "status": "success",
            "message": "La sauvegarde a été restaurée avec succès.",
            "safety_copy": str(safety_path),
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "La restauration a échoué. "
                "Vérifie que StaffTrack n'utilise pas la base "
                f"en parallèle. Détail : {exc}"
            ),
        ) from exc

    finally:
        if uploaded_path and uploaded_path.exists():
            uploaded_path.unlink(missing_ok=True)

        file.file.close()
