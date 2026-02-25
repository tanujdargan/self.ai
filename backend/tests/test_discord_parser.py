import pytest
from pathlib import Path
from app.parsers.discord import parse_discord_channel

FIXTURE = Path(__file__).parent / "fixtures" / "discord_sample" / "channel001"

def test_parse_discord_extracts_messages():
    result = parse_discord_channel(FIXTURE)
    assert result["source"] == "discord"
    text_msgs = [m for m in result["messages"] if m["type"] == "text"]
    assert len(text_msgs) == 2

def test_parse_discord_identifies_participants():
    result = parse_discord_channel(FIXTURE)
    assert "You" in result["participants"]
    assert "JohnDoe" in result["participants"]
