"""Regex-based parser for WhatsApp .txt chat exports."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Union

# Matches lines like:
#   MM/DD/YY, H:MM AM/PM - Sender: Message       (12h US format)
#   DD/MM/YY, H:MM AM/PM - Sender: Message        (12h non-US)
#   DD/MM/YY, HH:MM - Sender: Message             (24h format)
#   [DD/MM/YY, HH:MM:SS] Sender: Message          (bracket format)
_TIMESTAMP_RE = re.compile(
    r"^"
    r"(?:\[?)?"                         # optional opening bracket
    r"(\d{1,2}/\d{1,2}/\d{2,4})"       # date  (group 1)
    r",\s+"
    r"(\d{1,2}:\d{2}(?::\d{2})?)"      # time  (group 2)
    r"(?:\s*(AM|PM))?"                  # optional AM/PM (group 3)
    r"(?:\]?)?"                         # optional closing bracket
    r"\s*-\s+"                          # separator dash
    r"(.+)"                             # rest  (group 4)
)

# Known system message patterns (no colon-separated sender)
_SYSTEM_PATTERNS = [
    "messages and calls are end-to-end encrypted",
    "created group",
    "added you",
    "changed the subject",
    "changed this group",
    "left",
    "removed",
    "you're now an admin",
    "changed the group description",
    "disappeared message timer",
    "message timer was",
    "security code changed",
    "tap to learn more",
]

_MEDIA_MARKER = "<media omitted>"


def _parse_timestamp(date_str: str, time_str: str, ampm: str | None) -> datetime:
    """Parse the date and time parts into a datetime object.

    Tries MM/DD/YY first; if the month value exceeds 12 falls back to DD/MM/YY.
    """
    parts = date_str.split("/")
    a, b, year = int(parts[0]), int(parts[1]), parts[2]

    # Normalise 2-digit year
    if len(year) == 2:
        year = "20" + year

    # Build time string
    if ampm:
        time_fmt = "%I:%M %p" if ":" in time_str and time_str.count(":") == 1 else "%I:%M:%S %p"
        full_time = f"{time_str} {ampm}"
    else:
        time_fmt = "%H:%M" if time_str.count(":") == 1 else "%H:%M:%S"
        full_time = time_str

    # Try MM/DD first
    if a <= 12:
        try:
            return datetime.strptime(f"{a:02d}/{b:02d}/{year} {full_time}", f"%m/%d/%Y {time_fmt}")
        except ValueError:
            pass

    # Fallback to DD/MM
    return datetime.strptime(f"{b:02d}/{a:02d}/{year} {full_time}", f"%m/%d/%Y {time_fmt}")


def _is_system_message(text: str) -> bool:
    """Return True if the line (after timestamp + dash) looks like a system message."""
    lower = text.lower()
    return any(pat in lower for pat in _SYSTEM_PATTERNS)


def _split_sender_body(rest: str) -> tuple[str, str] | None:
    """Split 'Sender: message body' and return (sender, body).

    Returns None if no colon-separated sender is found (likely a system message).
    """
    # The sender name never contains a colon, so the first colon is the delimiter.
    idx = rest.find(": ")
    if idx == -1:
        return None
    sender = rest[:idx]
    body = rest[idx + 2:]
    return sender, body


def parse_whatsapp(path: Union[str, Path]) -> dict:
    """Parse a WhatsApp .txt export file and return a unified schema dict.

    Returns
    -------
    dict with keys:
        source           – "whatsapp"
        conversation_id  – deterministic hash of the file path
        participants     – sorted list of unique sender names
        messages         – list of message dicts {sender, timestamp, content, type}
    """
    path = Path(path)
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    messages: list[dict] = []
    participants: set[str] = set()

    for line in lines:
        m = _TIMESTAMP_RE.match(line)
        if m:
            date_str, time_str, ampm, rest = m.groups()

            # Skip system messages (no sender)
            if _is_system_message(rest):
                continue

            parts = _split_sender_body(rest)
            if parts is None:
                # System message without recognisable sender
                continue

            sender, body = parts
            ts = _parse_timestamp(date_str, time_str, ampm)

            # Determine message type
            if body.strip().lower() == _MEDIA_MARKER:
                msg_type = "media"
            else:
                msg_type = "text"

            participants.add(sender)
            messages.append(
                {
                    "sender": sender,
                    "timestamp": ts.isoformat(),
                    "content": body,
                    "type": msg_type,
                }
            )
        else:
            # Continuation line for a multiline message
            if messages:
                messages[-1]["content"] += "\n" + line

    conversation_id = hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:16]

    return {
        "source": "whatsapp",
        "conversation_id": conversation_id,
        "participants": sorted(participants),
        "messages": messages,
    }
