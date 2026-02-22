import aiosqlite
from pathlib import Path

from app.config import settings

_DB_SCHEMA = (Path(__file__).parent / "schema.sql").read_text()


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(settings.db_path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db() -> None:
    db = await get_db()
    try:
        await db.executescript(_DB_SCHEMA)
        await db.commit()
    finally:
        await db.close()
