"""Training data formatter for style and insights models."""

from typing import Any


def _msg_content(msg: dict[str, Any]) -> str:
    """Get message text, handling both 'content' and 'text' keys (iMessage uses 'text')."""
    return msg.get("content") or msg.get("text") or ""


def format_for_style(
    conversations: list[dict[str, Any]],
    self_name: str,
) -> list[dict[str, str]]:
    """Create instruction/output pairs from conversations.

    For each message from someone other than self_name, find the next
    message from self_name as the reply and pair them together.

    Returns a list of {"instruction": ..., "output": ...} dicts.
    """
    pairs: list[dict[str, str]] = []

    for convo in conversations:
        messages = convo.get("messages", [])
        for i, msg in enumerate(messages):
            if msg["sender"] != self_name:
                # Look for the next message from self_name
                for j in range(i + 1, len(messages)):
                    if messages[j]["sender"] == self_name:
                        instruction = _msg_content(msg)
                        output = _msg_content(messages[j])
                        if instruction and output:
                            pairs.append(
                                {
                                    "instruction": instruction,
                                    "output": output,
                                }
                            )
                        break
    return pairs


def format_for_insights(
    conversations: list[dict[str, Any]],
    self_name: str,
    chunk_size: int = 20,
) -> list[dict[str, Any]]:
    """Create conversation chunks for analysis.

    Groups messages into chunks of ``chunk_size``, skipping any chunk
    with fewer than 3 messages.  Each chunk is returned as a dict with
    keys: conversation, source, participants, self_name.
    """
    chunks: list[dict[str, Any]] = []

    for convo in conversations:
        messages = convo.get("messages", [])
        source = convo.get("source", "")
        participants = convo.get("participants", [])

        for start in range(0, len(messages), chunk_size):
            chunk_msgs = messages[start : start + chunk_size]
            if len(chunk_msgs) < 3:
                continue

            formatted_lines = []
            for msg in chunk_msgs:
                formatted_lines.append(f"{msg['sender']}: {_msg_content(msg)}")
            conversation_text = "\n".join(formatted_lines)

            chunks.append(
                {
                    "conversation": conversation_text,
                    "source": source,
                    "participants": participants,
                    "self_name": self_name,
                }
            )

    return chunks
