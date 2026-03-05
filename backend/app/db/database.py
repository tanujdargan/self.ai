import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import aiosqlite

from app.config import settings

_DB_SCHEMA = (Path(__file__).parent / "schema.sql").read_text()

logger = logging.getLogger("selfai.db")


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
    await _backfill_from_parsed()


async def _backfill_from_parsed() -> None:
    """Sync DB with parsed JSON files so import history survives restarts.

    For each parsed/{import_id}.json that has no matching DB rows,
    reads the file and inserts conversation records.
    """
    parsed_dir = settings.parsed_dir
    if not parsed_dir.exists():
        return

    parsed_files = list(parsed_dir.glob("*.json"))
    if not parsed_files:
        return

    db = await get_db()
    try:
        # Get all import_ids already tracked (stored as prefix of the id column
        # isn't reliable — instead check which file_names exist)
        cursor = await db.execute("SELECT DISTINCT file_name, source FROM conversations")
        existing = {(r["file_name"], r["source"]) for r in await cursor.fetchall()}

        backfilled = 0
        for path in sorted(parsed_files):
            import_id = path.stem

            # Try to find original filename from the imports directory
            import_dir = settings.imports_dir / import_id
            original_name = import_id + ".json"
            source = "unknown"
            if import_dir.exists():
                files = [f for f in import_dir.iterdir() if f.is_file() and not f.name.startswith(".")]
                if files:
                    original_name = files[0].name

            # Load parsed data to get conversation details
            try:
                data = json.loads(path.read_text())
            except (json.JSONDecodeError, OSError):
                continue

            convos = data if isinstance(data, list) else [data]

            # Detect source from the data
            for convo in convos:
                if convo.get("source"):
                    source = convo["source"]
                    break

            if (original_name, source) in existing:
                continue

            now = datetime.now(timezone.utc).isoformat()
            for convo in convos:
                participants = convo.get("participants", [])
                msg_count = len(convo.get("messages", []))
                convo_source = convo.get("source", source)
                await db.execute(
                    "INSERT OR IGNORE INTO conversations (id, source, file_name, participant_self, participants_json, message_count, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (uuid4().hex[:12], convo_source, original_name, "", json.dumps(participants), msg_count, now),
                )
            backfilled += 1

        if backfilled > 0:
            await db.commit()
            logger.info("Backfilled %d import(s) into DB from parsed files", backfilled)
    finally:
        await db.close()
