import pytest
import aiosqlite

from app.config import Settings
from app.db.database import init_db

EXPECTED_TABLES = {"conversations", "training_runs", "models", "chat_sessions", "chat_messages"}


@pytest.fixture
def tmp_settings(tmp_path, monkeypatch):
    """Override settings to use a temporary directory."""
    test_settings = Settings(selfai_home=tmp_path / ".selfai")
    test_settings.ensure_dirs()
    monkeypatch.setattr("app.db.database.settings", test_settings)
    return test_settings


@pytest.mark.asyncio
async def test_init_db_creates_all_tables(tmp_settings):
    await init_db()

    async with aiosqlite.connect(tmp_settings.db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        rows = await cursor.fetchall()
        table_names = {row[0] for row in rows}

    assert table_names == EXPECTED_TABLES


@pytest.mark.asyncio
async def test_init_db_is_idempotent(tmp_settings):
    await init_db()
    await init_db()

    async with aiosqlite.connect(tmp_settings.db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        rows = await cursor.fetchall()
        table_names = {row[0] for row in rows}

    assert table_names == EXPECTED_TABLES
