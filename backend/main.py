"""
Cadence backend — FastAPI app entry point
--------------------------------------------
Run: uvicorn main:app --reload --port 8000

All actual endpoint logic lives in routers/ — this file just wires the
app together (CORS, DB init, and mounting each router).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

import database as db
from routers import auth_routes, meetings, action_items, dashboard, projects

app = FastAPI(title="Cadence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,https://cadence-ai-meeting-assistant.vercel.app",
    ).split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()

app.include_router(projects.router)
app.include_router(auth_routes.router)
app.include_router(auth_routes.employees_router)
app.include_router(meetings.router)
app.include_router(action_items.router)
app.include_router(dashboard.router)


@app.get("/")
def health_check():
    return {"status": "Cadence API is running"}
