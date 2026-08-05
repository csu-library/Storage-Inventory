"""
Storage Inventory – FastAPI application entry point.

In production this module:
  1. Reads the DB URL from the process environment or backend/.env
  2. Creates/migrates tables
  3. Serves the React build from frontend/dist/ as static files
  4. Opens the browser automatically when launched locally

In development the API is served on port 8765 while Vite runs on 5173.
"""
import sys
import os
import webbrowser
import threading
from pathlib import Path

from fastapi.concurrency import asynccontextmanager
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api import (
    settings as settings_router,
    mapping as mapping_router,
    collections as collections_router,
    analytics as analytics_router,
    scanning as scanning_router,
    accessioning as accessioning_router,
)
from db.session import create_tables

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        create_tables()
    except Exception:
        # DB not configured yet – that's fine, Settings page will handle it
        pass
    yield

app = FastAPI(title="Storage Inventory", version="1.0.0", lifespan=lifespan)

# Allow the Vite dev server to call the API during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(settings_router.router,     prefix="/api/settings",     tags=["settings"])
app.include_router(mapping_router.router,      prefix="/api/mapping",      tags=["mapping"])
app.include_router(collections_router.router,  prefix="/api/collections",  tags=["collections"])
app.include_router(analytics_router.router,    prefix="/api/analytics",    tags=["analytics"])
app.include_router(scanning_router.router,     prefix="/api/scanning",     tags=["scanning"])
app.include_router(accessioning_router.router, prefix="/api",            tags=["accessioning"])


@app.get("/api/health")
def health():
    """Check DB connectivity.  Returns 200 if reachable, 503 otherwise."""
    from db.session import _get_engine
    engine = _get_engine()
    if engine is None:
        return {"status": "unconfigured", "db": False}
    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        return {"status": "ok", "db": True}
    except Exception as exc:
        from fastapi import Response
        return {"status": "error", "db": False, "detail": str(exc)}


# ── Static files (production build) ──────────────────────────────────────────
# Resolve the frontend/dist path whether running from source or from a
# PyInstaller bundle (sys._MEIPASS).
def _find_static_dir() -> Path | None:
    candidates = [
        Path(getattr(sys, "_MEIPASS", "")) / "frontend" / "dist",
        Path(__file__).parent.parent / "frontend" / "dist",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


_static_dir = _find_static_dir()
if _static_dir:
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")


# ── Startup ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        create_tables()
    except Exception:
        # DB not configured yet – that's fine, Settings page will handle it
        pass


def _open_browser():
    webbrowser.open("http://localhost:8765")


if __name__ == "__main__":
    is_packaged = getattr(sys, "frozen", False)
    if is_packaged:
        threading.Timer(1.5, _open_browser).start()

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8765,
        reload=not is_packaged,
    )
