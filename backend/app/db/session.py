
import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


# Dossier du backend en développement.
BACKEND_DIR = Path(__file__).resolve().parents[2]

# En production, Electron pourra définir un dossier persistant.
# En développement, on conserve le chemin actuel.
DATA_DIR = Path(
    os.environ.get(
        "STAFFTRACK_DATA_DIR",
        str(BACKEND_DIR / "data"),
    )
)

DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{(DATA_DIR / 'stafftrack.db').as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass
