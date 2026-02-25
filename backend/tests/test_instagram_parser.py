import pytest
from pathlib import Path
from app.parsers.instagram import parse_instagram

FIXTURE = Path(__file__).parent / "fixtures" / "instagram_sample.json"

def test_parse_instagram_extracts_messages():
    result = parse_instagram(FIXTURE)
    assert result["source"] == "instagram"
    assert set(result["participants"]) == {"JohnDoe", "You"}
    text_msgs = [m for m in result["messages"] if m["type"] == "text"]
    assert len(text_msgs) == 2

def test_parse_instagram_handles_shares_as_media():
    result = parse_instagram(FIXTURE)
    media_msgs = [m for m in result["messages"] if m["type"] == "media"]
    assert len(media_msgs) == 1
