import pytest
from pathlib import Path
from app.parsers.email_parser import parse_mbox

FIXTURE = Path(__file__).parent / "fixtures" / "sample.mbox"

def test_parse_mbox_extracts_messages():
    results = parse_mbox(FIXTURE)
    assert len(results) >= 1
    convo = results[0]
    assert convo["source"] == "email"
    assert len(convo["messages"]) == 2

def test_parse_mbox_strips_quoted_replies():
    results = parse_mbox(FIXTURE)
    convo = results[0]
    reply = [m for m in convo["messages"] if "great" in m["content"]][0]
    assert "Hey, how are you?" not in reply["content"]
