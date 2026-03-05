import shutil
from fastapi import APIRouter
from app.config import settings
from app.db.database import get_db
from app.training.manager import load_parsed_conversations, detect_self_name

router = APIRouter(prefix="/api/data", tags=["data"])


def _dir_size_mb(path) -> float:
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    return round(total / (1024 * 1024), 2)


@router.get("/stats")
async def get_stats():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT COUNT(*) as count FROM conversations")
        conv_count = (await cursor.fetchone())["count"]

        cursor = await db.execute("SELECT SUM(message_count) as total FROM conversations")
        row = await cursor.fetchone()
        msg_count = row["total"] or 0

        cursor = await db.execute(
            "SELECT source, COUNT(*) as count, SUM(message_count) as messages FROM conversations GROUP BY source"
        )
        by_source = [dict(r) for r in await cursor.fetchall()]

        storage = {
            "imports_mb": _dir_size_mb(settings.imports_dir),
            "parsed_mb": _dir_size_mb(settings.parsed_dir),
            "models_mb": _dir_size_mb(settings.models_dir),
            "total_mb": _dir_size_mb(settings.selfai_home),
        }

        return {
            "conversations": conv_count,
            "total_messages": msg_count,
            "by_source": by_source,
            "storage": storage,
        }
    finally:
        await db.close()


@router.get("/conversations")
async def list_conversations():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM conversations ORDER BY imported_at DESC")
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


@router.get("/self-name")
async def get_self_name():
    conversations = load_parsed_conversations()
    name = detect_self_name(conversations) if conversations else None
    return {"self_name": name}


@router.delete("")
async def wipe_all_data():
    # Delete data directories
    for d in [settings.imports_dir, settings.parsed_dir, settings.training_dir]:
        if d.exists():
            shutil.rmtree(d)
            d.mkdir(parents=True, exist_ok=True)

    # Clear database tables
    db = await get_db()
    try:
        await db.execute("DELETE FROM chat_messages")
        await db.execute("DELETE FROM chat_sessions")
        await db.execute("DELETE FROM models")
        await db.execute("DELETE FROM training_runs")
        await db.execute("DELETE FROM conversations")
        await db.commit()
        return {"status": "wiped"}
    finally:
        await db.close()
