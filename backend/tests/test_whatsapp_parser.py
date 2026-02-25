import pytest
from pathlib import Path
from app.parsers.whatsapp import parse_whatsapp

FIXTURE = Path(__file__).parent / "fixtures" / "whatsapp_sample.txt"

def test_parse_whatsapp_extracts_messages():
    result = parse_whatsapp(FIXTURE)
    assert result["source"] == "whatsapp"
    assert set(result["participants"]) == {"John", "You"}
    text_msgs = [m for m in result["messages"] if m["type"] == "text"]
    assert len(text_msgs) == 5

def test_parse_whatsapp_handles_multiline():
    result = parse_whatsapp(FIXTURE)
    multiline = [m for m in result["messages"] if "multiline" in m["content"]]
    assert len(multiline) == 1
    assert "it's a multiline message" in multiline[0]["content"]
