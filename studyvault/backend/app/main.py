from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import admin, auth, resources, search, subjects, users

app = FastAPI(title="StudyVault API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, subjects, resources, search, users, admin):
    app.include_router(module.router)


@app.get("/api/health")
def health():
    return {"ok": True}
