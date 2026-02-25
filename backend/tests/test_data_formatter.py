import pytest
from app.services.data_formatter import format_for_style, format_for_insights

SAMPLE_CONVO = {
    "source": "whatsapp",
    "conversation_id": "abc",
    "participants": ["John", "me"],
    "messages": [
        {"sender": "John", "timestamp": "2024-01-01T10:00:00", "content": "Hey", "type": "text"},
        {"sender": "me", "timestamp": "2024-01-01T10:01:00", "content": "Hi!", "type": "text"},
        {"sender": "John", "timestamp": "2024-01-01T10:02:00", "content": "How are you?", "type": "text"},
        {"sender": "me", "timestamp": "2024-01-01T10:03:00", "content": "Good, you?", "type": "text"},
    ],
}

def test_format_for_style_creates_pairs():
    pairs = format_for_style([SAMPLE_CONVO], self_name="me")
    assert len(pairs) == 2
    assert pairs[0]["instruction"] == "Hey"
    assert pairs[0]["output"] == "Hi!"
    assert pairs[1]["instruction"] == "How are you?"
    assert pairs[1]["output"] == "Good, you?"

def test_format_for_insights_creates_chunks():
    chunks = format_for_insights([SAMPLE_CONVO], self_name="me")
    assert len(chunks) >= 1
    assert "Hey" in chunks[0]["conversation"]
