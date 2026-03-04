"""Parser for Instagram JSON export format."""

import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from typing import Any


def _fix_encoding(text: str) -> str:
    """Fix Instagram's latin-1 encoded UTF-8 strings.

    Instagram exports encode UTF-8 characters as latin-1 byte sequences.
    This function decodes them back to proper UTF-8.
    """
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return text


def _classify_message(msg: dict[str, Any]) -> str:
    """Classify an Instagram message into a unified type.

    Returns:
        'text' for Generic messages with content,
        'media' for Share/photos/videos/audio messages.
    """
    msg_type = msg.get("type", "")
    if msg_type == "Generic" and "content" in msg:
        return "text"
    # Share, photos, videos, audio are all treated as media
    return "media"


def _timestamp_ms_to_iso(timestamp_ms: int) -> str:
    """Convert millisecond timestamp to ISO 8601 string."""
    dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
    return dt.isoformat()


def parse_instagram(filepath: Path | str) -> dict[str, Any]:
    """Parse an Instagram JSON export file into the unified schema.

    Args:
        filepath: Path to the Instagram JSON export file.

    Returns:
        Dictionary with unified schema:
        {
            "source": "instagram",
            "conversation_id": str,
            "participants": list[str],
            "messages": list[dict]
        }
    """
    filepath = Path(filepath)

    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)

    participants = [_fix_encoding(p["name"]) for p in data.get("participants", [])]

    title = _fix_encoding(data.get("title", ""))
    conversation_id = hashlib.sha256(title.encode("utf-8")).hexdigest()[:16]

    raw_messages = data.get("messages", [])

    # Instagram stores messages newest first; reverse to chronological order
    raw_messages = list(reversed(raw_messages))

    messages = []
    for msg in raw_messages:
        unified_type = _classify_message(msg)
        sender = _fix_encoding(msg.get("sender_name", ""))
        timestamp_ms = msg.get("timestamp_ms", 0)

        unified_msg: dict[str, Any] = {
            "sender": sender,
            "timestamp": _timestamp_ms_to_iso(timestamp_ms),
            "type": unified_type,
        }

        if unified_type == "text":
            unified_msg["content"] = _fix_encoding(msg.get("content", ""))
        elif unified_type == "media":
            # Include share link or photo/video URI if available
            if "share" in msg:
                unified_msg["media_url"] = msg["share"].get("link", "")
            elif "photos" in msg:
                unified_msg["media_url"] = msg["photos"][0].get("uri", "")
            elif "videos" in msg:
                unified_msg["media_url"] = msg["videos"][0].get("uri", "")
            elif "audio_files" in msg:
                unified_msg["media_url"] = msg["audio_files"][0].get("uri", "")

        messages.append(unified_msg)

    return {
        "source": "instagram",
        "conversation_id": conversation_id,
        "participants": participants,
        "messages": messages,
    }


def parse_instagram_multi(json_paths: list[Path]) -> dict[str, Any]:
    """Parse multiple Instagram JSON files for one conversation, merge and deduplicate.

    Instagram splits large conversations across message_1.json, message_2.json, etc.
    This function loads all of them, merges messages, deduplicates, and sorts chronologically.

    Args:
        json_paths: List of JSON file paths belonging to the same conversation.

    Returns:
        Unified schema dict (same format as parse_instagram).
    """
    all_raw_messages: list[dict[str, Any]] = []
    participants: list[str] = []
    title = ""

    for path in json_paths:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)

        if not participants:
            participants = [_fix_encoding(p["name"]) for p in data.get("participants", [])]
        if not title:
            title = _fix_encoding(data.get("title", ""))

        all_raw_messages.extend(data.get("messages", []))

    # Deduplicate by (sender_name, timestamp_ms) — Instagram can duplicate across files
    seen: set[tuple[str, int]] = set()
    unique_messages: list[dict[str, Any]] = []
    for msg in all_raw_messages:
        key = (msg.get("sender_name", ""), msg.get("timestamp_ms", 0))
        if key not in seen:
            seen.add(key)
            unique_messages.append(msg)

    # Sort chronologically (oldest first)
    unique_messages.sort(key=lambda m: m.get("timestamp_ms", 0))

    conversation_id = hashlib.sha256(title.encode("utf-8")).hexdigest()[:16]

    messages = []
    for msg in unique_messages:
        unified_type = _classify_message(msg)
        sender = _fix_encoding(msg.get("sender_name", ""))
        timestamp_ms = msg.get("timestamp_ms", 0)

        unified_msg: dict[str, Any] = {
            "sender": sender,
            "timestamp": _timestamp_ms_to_iso(timestamp_ms),
            "type": unified_type,
        }

        if unified_type == "text":
            unified_msg["content"] = _fix_encoding(msg.get("content", ""))
        elif unified_type == "media":
            if "share" in msg:
                unified_msg["media_url"] = msg["share"].get("link", "")
            elif "photos" in msg:
                unified_msg["media_url"] = msg["photos"][0].get("uri", "")
            elif "videos" in msg:
                unified_msg["media_url"] = msg["videos"][0].get("uri", "")
            elif "audio_files" in msg:
                unified_msg["media_url"] = msg["audio_files"][0].get("uri", "")

        messages.append(unified_msg)

    return {
        "source": "instagram",
        "conversation_id": conversation_id,
        "participants": participants,
        "messages": messages,
    }
