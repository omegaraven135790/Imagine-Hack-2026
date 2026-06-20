import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import create_db_and_tables

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        create_db_and_tables()
    except Exception as exc:
        logger.warning(
            "create_db_and_tables skipped (schema already applied or no models yet): %s", exc
        )
    yield


app = FastAPI(
    title="ResWatch Retail API",
    version="2.0.0",
    description="Smarter resource management for retail SMEs.",
    lifespan=lifespan,
)

_base_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
_extra = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
_allowed_origins = _base_origins + _extra

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers (mounted as each feature is built) ────────────────────────────────
from routers import stores, tariffs, energy, footfall, inventory, forecast, anomalies, waste, schedule

app.include_router(stores.router,    prefix="/api")
app.include_router(tariffs.router,   prefix="/api")
app.include_router(energy.router,    prefix="/api")
app.include_router(footfall.router,  prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(forecast.router,  prefix="/api")
app.include_router(anomalies.router, prefix="/api")
app.include_router(waste.router,     prefix="/api")
app.include_router(schedule.router,  prefix="/api")
# Phase 3:            insights
# Phase 4:            report, monitoring


@app.get("/health", tags=["health"])
def health() -> dict:
    return {
        "status": "ok",
        "app": "ResWatch Retail",
        "version": "2.0.0",
    }
