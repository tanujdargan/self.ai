"""Regex-based parser for WhatsApp .txt chat exports."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Union

# Strip unicode control characters that WhatsApp embeds (LTR mark, narrow NBSP, etc.)
_UNICODE_JUNK = re.compile(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00a0\u202f]")

# Format A (slash dates):  MM/DD/YY, H:MM AM - Sender: Message
#                          DD/MM/YY, HH:MM - Sender: Message
#                          [DD/MM/YY, HH:MM:SS] Sender: Message
_TIMESTAMP_SLASH_RE = re.compile(
    r"^\[?"
    r"(\d{1,2}/\d{1,2}/\d{2,4})"       # date  (group 1)
    r",\s+"
    r"(\d{1,2}:\d{2}(?::\d{2})?)"      # time  (group 2)
    r"(?:\s*(AM|PM))?"                  # optional AM/PM (group 3)
    r"\]?"
    r"\s*[-\]]\s*"                      # separator: dash or closing bracket
    r"(.+)"                             # rest  (group 4)
)

# Format B (ISO dates):  [2023-01-24, 3:26:27 AM] Sender: Message
_TIMESTAMP_ISO_RE = re.compile(
    r"^\[?"
    r"(\d{4}-\d{2}-\d{2})"             # date YYYY-MM-DD (group 1)
    r",\s+"
    r"(\d{1,2}:\d{2}(?::\d{2})?)"      # time  (group 2)
    r"(?:\s*(AM|PM))?"                  # optional AM/PM (group 3)
    r"\]?\s+"
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
    "changed their phone number",
    "you deleted this message",
    "this message was deleted",
    "you blocked this contact",
    "you unblocked this contact",
]

_MEDIA_MARKERS = {"<media omitted>", "image omitted", "video omitted", "audio omitted",
                   "sticker omitted", "document omitted", "gif omitted", "contact card omitted"}


def _parse_timestamp(date_str: str, time_str: str, ampm: str | None) -> datetime:
    """Parse the date and time parts into a datetime object.

    Handles both slash formats (MM/DD/YY, DD/MM/YY) and ISO format (YYYY-MM-DD).
    """
    # Build time string
    if ampm:
        time_fmt = "%I:%M %p" if time_str.count(":") == 1 else "%I:%M:%S %p"
        full_time = f"{time_str} {ampm}"
    else:
        time_fmt = "%H:%M" if time_str.count(":") == 1 else "%H:%M:%S"
        full_time = time_str

    # ISO format: YYYY-MM-DD
    if "-" in date_str:
        return datetime.strptime(f"{date_str} {full_time}", f"%Y-%m-%d {time_fmt}")

    # Slash format
    parts = date_str.split("/")
    a, b, year = int(parts[0]), int(parts[1]), parts[2]

    if len(year) == 2:
        year = "20" + year

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

    for raw_line in lines:
        # Strip invisible unicode control characters that WhatsApp embeds
        line = _UNICODE_JUNK.sub("", raw_line).strip()

        # Try both timestamp formats
        m = _TIMESTAMP_SLASH_RE.match(line) or _TIMESTAMP_ISO_RE.match(line)
        if m:
            date_str, time_str, ampm, rest = m.groups()

            # Skip system messages (no sender)
            if _is_system_message(rest):
                continue

            parts = _split_sender_body(rest)
            if parts is None:
                continue

            sender, body = parts

            # Strip LTR marks from body too
            body = body.strip()

            # Skip system messages that appear after the sender
            if _is_system_message(body):
                continue

            ts = _parse_timestamp(date_str, time_str, ampm)

            # Determine message type
            body_lower = body.lower()
            if body_lower in _MEDIA_MARKERS or body_lower.startswith("<attached:"):
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
                messages[-1]["content"] += "\n" + raw_line

    conversation_id = hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:16]

    return {
        "source": "whatsapp",
        "conversation_id": conversation_id,
        "participants": sorted(participants),
        "messages": messages,
    }
