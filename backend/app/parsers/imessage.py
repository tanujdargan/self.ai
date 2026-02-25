"""Parser for macOS iMessage chat.db (SQLite)."""

from __future__ import annotations

import platform
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

# iMessage epoch: 2001-01-01 00:00:00 UTC
_IMESSAGE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)
_NS_PER_SECOND = 1_000_000_000


def _ns_to_iso(nanoseconds: int) -> str:
    """Convert iMessage nanosecond timestamp to ISO-8601 string."""
    seconds = nanoseconds / _NS_PER_SECOND
    dt = _IMESSAGE_EPOCH + timedelta(seconds=seconds)
    return dt.isoformat()


def _default_db_path() -> Path:
    """Return the default iMessage database path on macOS."""
    return Path.home() / "Library" / "Messages" / "chat.db"


def parse_imessage(db_path: Path | str | None = None) -> list[dict[str, Any]]:
    """Parse an iMessage chat.db and return a list of conversation dicts.

    Each conversation dict has the shape:
        {
            "source": "imessage",
            "chat_id": <int>,
            "display_name": <str or None>,
            "participants": [<handle_id>, ...],
            "messages": [
                {
                    "sender": "me" | <handle string>,
                    "text": <str>,
                    "timestamp": <ISO-8601 str>,
                    "type": "text" | "attachment",
                },
                ...
            ],
        }

    Args:
        db_path: Path to the iMessage chat.db file.  If *None*, the default
                 macOS path ``~/Library/Messages/chat.db`` is used (macOS only).

    Returns:
        A list of conversation dicts, one per chat.

    Raises:
        RuntimeError: If no *db_path* is given and the current platform is not
                      macOS.
        FileNotFoundError: If the resolved database file does not exist.
    """
    if db_path is None:
        if platform.system() != "Darwin":
            raise RuntimeError(
                "iMessage parsing without an explicit db_path is only "
                "supported on macOS."
            )
        db_path = _default_db_path()

    db_path = Path(db_path)
    if not db_path.exists():
        raise FileNotFoundError(f"iMessage database not found: {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        return _extract_conversations(conn)
    finally:
        conn.close()


def _extract_conversations(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Query the database and build conversation dicts."""
    # Build handle lookup: ROWID -> id string (e.g. phone number / email)
    handles: dict[int, str] = {}
    for row in conn.execute("SELECT ROWID, id FROM handle"):
        handles[row["ROWID"]] = row["id"]

    # Fetch all chats
    chats = conn.execute("SELECT ROWID, display_name FROM chat").fetchall()

    conversations: list[dict[str, Any]] = []
    for chat in chats:
        chat_id: int = chat["ROWID"]
        display_name: str | None = chat["display_name"]

        # Fetch messages belonging to this chat, ordered by date
        rows = conn.execute(
            """
            SELECT m.text,
                   m.handle_id,
                   m.date,
                   m.is_from_me,
                   m.cache_has_attachments
              FROM message m
              JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
             WHERE cmj.chat_id = ?
             ORDER BY m.date ASC
            """,
            (chat_id,),
        ).fetchall()

        messages: list[dict[str, Any]] = []
        participants: set[str] = set()

        for row in rows:
            is_from_me: bool = bool(row["is_from_me"])
            handle_id: int = row["handle_id"]
            text: str | None = row["text"]
            has_attachment: bool = bool(row["cache_has_attachments"])
            date_ns: int = row["date"]

            sender: str
            if is_from_me:
                sender = "me"
            else:
                sender = handles.get(handle_id, f"unknown-{handle_id}")
                participants.add(sender)

            timestamp = _ns_to_iso(date_ns)

            if text is not None:
                messages.append(
                    {
                        "sender": sender,
                        "text": text,
                        "timestamp": timestamp,
                        "type": "text",
                    }
                )
            elif has_attachment:
                messages.append(
                    {
                        "sender": sender,
                        "text": "",
                        "timestamp": timestamp,
                        "type": "attachment",
                    }
                )
            # Skip messages with no text and no attachment (rare edge case)

        conversations.append(
            {
                "source": "imessage",
                "chat_id": chat_id,
                "display_name": display_name,
                "participants": sorted(participants),
                "messages": messages,
            }
        )

    return conversations
