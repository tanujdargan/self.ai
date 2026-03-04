"""Parser for Discord GDPR data-export format.

Each channel directory contains:
  - messages.json  – array of message objects
  - channel.json   – metadata (id, type, name)
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any


def parse_discord_channel(channel_dir: Path) -> dict[str, Any]:
    """Parse a single Discord channel directory into the unified schema.

    Parameters
    ----------
    channel_dir:
        Path to a channel folder containing ``messages.json`` and
        optionally ``channel.json``.

    Returns
    -------
    dict with keys ``source``, ``conversation_id``, ``participants``,
    ``messages``.
    """
    channel_dir = Path(channel_dir)

    # -- channel metadata -----------------------------------------------------
    channel_path = channel_dir / "channel.json"
    if channel_path.exists():
        with open(channel_path, "r", encoding="utf-8", errors="replace") as f:
            channel_meta = json.load(f)
        conversation_id = channel_meta.get("id", channel_dir.name)
    else:
        conversation_id = channel_dir.name

    # -- messages -------------------------------------------------------------
    messages_path = channel_dir / "messages.json"
    with open(messages_path, "r", encoding="utf-8", errors="replace") as f:
        raw_messages: list[dict[str, Any]] = json.load(f)

    participants: set[str] = set()
    messages: list[dict[str, Any]] = []

    for raw in raw_messages:
        sender = raw.get("Author", {}).get("username", "unknown")
        participants.add(sender)

        content = raw.get("Contents", "")
        attachments = raw.get("Attachments", "")

        # Determine message type: if content is empty but attachments exist,
        # treat as a media message.
        if content:
            msg_type = "text"
        elif attachments:
            msg_type = "media"
            content = attachments
        else:
            # Skip completely empty messages (no text, no attachments).
            continue

        timestamp = datetime.fromisoformat(raw["Timestamp"])

        messages.append(
            {
                "sender": sender,
                "timestamp": timestamp.isoformat(),
                "content": content,
                "type": msg_type,
            }
        )

    return {
        "source": "discord",
        "conversation_id": conversation_id,
        "participants": sorted(participants),
        "messages": messages,
    }
