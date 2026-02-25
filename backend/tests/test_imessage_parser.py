import pytest
import sqlite3
from pathlib import Path
from app.parsers.imessage import parse_imessage


@pytest.fixture
def fake_chat_db(tmp_path):
    db_path = tmp_path / "chat.db"
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
        CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT);
        CREATE TABLE message (
            ROWID INTEGER PRIMARY KEY,
            text TEXT,
            handle_id INTEGER,
            date INTEGER,
            is_from_me INTEGER,
            cache_has_attachments INTEGER DEFAULT 0
        );
        CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);

        INSERT INTO handle VALUES (1, '+1234567890');
        INSERT INTO chat VALUES (1, 'John');
        INSERT INTO message VALUES (1, 'Hey there', 1, 700000000000000000, 0, 0);
        INSERT INTO message VALUES (2, 'Hi!', 0, 700000060000000000, 1, 0);
        INSERT INTO message VALUES (3, NULL, 1, 700000120000000000, 0, 1);
        INSERT INTO chat_message_join VALUES (1, 1);
        INSERT INTO chat_message_join VALUES (1, 2);
        INSERT INTO chat_message_join VALUES (1, 3);
    """)
    conn.close()
    return db_path


def test_parse_imessage_extracts_text(fake_chat_db):
    results = parse_imessage(fake_chat_db)
    assert len(results) >= 1
    convo = results[0]
    assert convo["source"] == "imessage"
    text_msgs = [m for m in convo["messages"] if m["type"] == "text"]
    assert len(text_msgs) == 2
