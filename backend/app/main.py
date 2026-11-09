from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.employees import router as employees_router
from app.api.attendance import router as attendance_router
from app.api.backup import router as backup_router

app = FastAPI(
    title="StaffTrack API",
    description="API locale de gestion du personnel et des présences",
    version="1.0.0",
)

# Autoriser le frontend local à communiquer avec l'API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(employees_router)
app.include_router(attendance_router)
app.include_router(backup_router)

@app.get("/")
def accueil():
    return {
        "application": "StaffTrack",
        "message": "Le serveur fonctionne correctement.",
        "version": "1.0.0",
    }


@app.get("/health")
def verifier_sante():
    return {"status": "ok"}
