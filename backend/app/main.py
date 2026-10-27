"""FastAPI entry point.  Run:  uvicorn app.main:app --reload"""
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .db import init_db
from .routers import datasets, meta, playground, runs
from .runner import recover_interrupted_runs
from .security import BodySizeLimitMiddleware, SecurityHeadersMiddleware, require_api_key

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("eval_harness")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    recover_interrupted_runs()
    s = get_settings()
    if s.is_production and not s.app_api_key:
        log.warning("APP_ENV=production but APP_API_KEY is not set: the API is open to anyone who can reach it.")
    yield


settings = get_settings()
app = FastAPI(
    title="LLM Eval Harness",
    version="1.0.0",
    lifespan=lifespan,
    # Hide interactive docs in production to reduce attack surface.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,   # explicit allow-list, never "*"
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key"],
)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    # Log the details server-side; never leak stack traces or secrets to clients.
    log.exception("Unhandled error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


@app.get("/health", tags=["meta"])
def health() -> dict:
    """Unauthenticated liveness probe for load balancers. Reveals nothing."""
    return {"status": "ok"}


protected = [Depends(require_api_key)]
app.include_router(meta.router, prefix="/api", dependencies=protected)
app.include_router(datasets.router, prefix="/api", dependencies=protected)
app.include_router(runs.router, prefix="/api", dependencies=protected)
app.include_router(playground.router, prefix="/api", dependencies=protected)
