"""Parse .mbox email files into threaded conversation dicts."""

from __future__ import annotations

import mailbox
from collections import defaultdict
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path
from typing import Any

from email_reply_parser import EmailReplyParser


def _extract_sender_name(from_header: str) -> str:
    """Extract the display name from a From header, falling back to email."""
    name, addr = parseaddr(from_header)
    return name if name else addr


def _get_message_id(msg: mailbox.mboxMessage) -> str | None:
    mid = msg.get("Message-ID", "")
    return mid.strip() if mid else None


def _get_in_reply_to(msg: mailbox.mboxMessage) -> str | None:
    irt = msg.get("In-Reply-To", "")
    return irt.strip() if irt else None


def _get_references(msg: mailbox.mboxMessage) -> list[str]:
    refs = msg.get("References", "")
    if not refs:
        return []
    return [r.strip() for r in refs.split() if r.strip()]


def _get_body(msg: mailbox.mboxMessage) -> str:
    """Extract the plain-text body from an email message."""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode("utf-8", errors="replace")
        return ""
    payload = msg.get_payload(decode=True)
    if payload:
        return payload.decode("utf-8", errors="replace")
    # Fallback: get_payload without decode for simple text messages
    raw = msg.get_payload()
    return raw if isinstance(raw, str) else ""


def _strip_quoted_reply(text: str) -> str:
    """Use email-reply-parser to strip quoted/forwarded content."""
    reply = EmailReplyParser.parse_reply(text)
    return reply.strip()


def parse_mbox(path: str | Path) -> list[dict[str, Any]]:
    """Parse an mbox file and return a list of conversation dicts.

    Each conversation dict has the shape:
        {
            "source": "email",
            "messages": [
                {
                    "sender": str,
                    "content": str,
                    "timestamp": str (ISO 8601),
                },
                ...
            ],
        }

    Messages are grouped into threads using In-Reply-To, References,
    and Message-ID headers. Each thread becomes one conversation.
    """
    mbox = mailbox.mbox(str(path))

    # First pass: parse all messages and index by Message-ID
    parsed_msgs: list[dict[str, Any]] = []
    msg_id_map: dict[str, int] = {}  # message-id -> index in parsed_msgs

    for msg in mbox:
        body = _get_body(msg)
        cleaned_body = _strip_quoted_reply(body)

        from_header = msg.get("From", "")
        sender = _extract_sender_name(from_header)

        date_header = msg.get("Date", "")
        try:
            dt = parsedate_to_datetime(date_header)
            timestamp = dt.isoformat()
        except Exception:
            timestamp = ""

        message_id = _get_message_id(msg)
        in_reply_to = _get_in_reply_to(msg)
        references = _get_references(msg)

        idx = len(parsed_msgs)
        entry = {
            "sender": sender,
            "content": cleaned_body,
            "timestamp": timestamp,
            "message_id": message_id,
            "in_reply_to": in_reply_to,
            "references": references,
        }
        parsed_msgs.append(entry)
        if message_id:
            msg_id_map[message_id] = idx

    # Second pass: group into threads using Union-Find approach
    # Each message starts in its own thread; we merge threads based on
    # In-Reply-To and References.
    parent: list[int] = list(range(len(parsed_msgs)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            # Keep the earlier message as root
            if ra < rb:
                parent[rb] = ra
            else:
                parent[ra] = rb

    for idx, entry in enumerate(parsed_msgs):
        # Link to In-Reply-To
        irt = entry["in_reply_to"]
        if irt and irt in msg_id_map:
            union(idx, msg_id_map[irt])

        # Link to References
        for ref in entry["references"]:
            if ref in msg_id_map:
                union(idx, msg_id_map[ref])

    # Group messages by thread root
    threads: dict[int, list[int]] = defaultdict(list)
    for idx in range(len(parsed_msgs)):
        threads[find(idx)].append(idx)

    # Build conversation dicts
    conversations: list[dict[str, Any]] = []
    for root in sorted(threads.keys()):
        indices = threads[root]
        # Sort messages within thread by timestamp
        indices.sort(key=lambda i: parsed_msgs[i]["timestamp"])
        messages = []
        for i in indices:
            m = parsed_msgs[i]
            messages.append({
                "sender": m["sender"],
                "content": m["content"],
                "timestamp": m["timestamp"],
            })
        conversations.append({
            "source": "email",
            "messages": messages,
        })

    return conversations
