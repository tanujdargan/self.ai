import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.database import init_db
from app.routers.chat import router as chat_router
from app.routers.data import router as data_router
from app.routers.imports import router as import_router
from app.routers.models import router as models_router
from app.routers.openai_compat import router as openai_router
from app.routers.system import router as system_router
from app.routers.training import router as training_router

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
LOG_FORMAT = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
logging.basicConfig(
    level=logging.DEBUG,
    format=LOG_FORMAT,
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)
# Quiet noisy third-party loggers
for noisy in ("httpcore", "httpx", "multipart", "urllib3", "aiosqlite"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

logger = logging.getLogger("selfai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    await init_db()
    logger.info("Self.ai started — data: %s", settings.data_dir)
    yield
    logger.info("Self.ai shutting down")


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:8420",   # Production
        "http://127.0.0.1:8420",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


app.include_router(chat_router)
app.include_router(data_router)
app.include_router(import_router)
app.include_router(models_router)
app.include_router(openai_router)
app.include_router(system_router)
app.include_router(training_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}


# Static file serving for built frontend — must be AFTER all router registrations
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
