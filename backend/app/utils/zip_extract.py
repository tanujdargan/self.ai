"""Source-aware extraction of chat exports from zip files.

Only extracts the files needed for parsing (no media).
"""

import zipfile
from collections import defaultdict
from pathlib import Path


def extract_instagram_from_zip(
    zip_path: Path, extract_dir: Path
) -> dict[str, list[Path]]:
    """Extract Instagram DM JSON files from a zip.

    Finds files matching **/messages/inbox/*/message_*.json,
    groups them by conversation folder.

    Returns:
        Dict mapping conversation folder name to list of extracted JSON paths.
        Example: {"alice_12345": [Path(".../message_1.json"), Path(".../message_2.json")]}
    """
    conversations: dict[str, list[Path]] = defaultdict(list)

    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            parts = Path(name).parts
            # Look for .../messages/inbox/{thread}/message_*.json
            try:
                inbox_idx = next(
                    i
                    for i, p in enumerate(parts)
                    if p == "inbox" and i > 0 and parts[i - 1] == "messages"
                )
            except StopIteration:
                continue

            if inbox_idx + 2 >= len(parts):
                continue

            filename = parts[-1]
            if not filename.startswith("message_") or not filename.endswith(".json"):
                continue

            thread_name = parts[inbox_idx + 1]
            target = extract_dir / thread_name / filename
            target.parent.mkdir(parents=True, exist_ok=True)

            with zf.open(name) as src, open(target, "wb") as dst:
                dst.write(src.read())

            conversations[thread_name].append(target)

    # Sort files within each conversation by name (message_1, message_2, ...)
    for thread in conversations:
        conversations[thread].sort(key=lambda p: p.name)

    return dict(conversations)


def extract_email_from_zip(zip_path: Path, extract_dir: Path) -> Path:
    """Extract the .mbox file from a Google Takeout zip.

    Returns:
        Path to the extracted .mbox file.

    Raises:
        ValueError: If no .mbox file found in the zip.
    """
    with zipfile.ZipFile(zip_path, "r") as zf:
        mbox_files = [n for n in zf.namelist() if n.endswith(".mbox")]
        if not mbox_files:
            raise ValueError("No .mbox file found in email zip")

        target_name = max(mbox_files, key=lambda n: zf.getinfo(n).file_size)

        target = extract_dir / Path(target_name).name
        target.parent.mkdir(parents=True, exist_ok=True)

        with zf.open(target_name) as src, open(target, "wb") as dst:
            while chunk := src.read(8 * 1024 * 1024):
                dst.write(chunk)

    return target


def extract_whatsapp_from_zip(zip_path: Path, extract_dir: Path) -> Path:
    """Extract the WhatsApp .txt chat file from a zip.

    Returns:
        Path to the extracted .txt file.

    Raises:
        ValueError: If no .txt file found in the zip.
    """
    with zipfile.ZipFile(zip_path, "r") as zf:
        txt_files = [n for n in zf.namelist() if n.endswith(".txt")]
        if not txt_files:
            raise ValueError("No .txt file found in WhatsApp zip")

        # Pick the largest .txt file (the chat export, not any small metadata)
        target_name = max(txt_files, key=lambda n: zf.getinfo(n).file_size)

        target = extract_dir / Path(target_name).name
        target.parent.mkdir(parents=True, exist_ok=True)

        with zf.open(target_name) as src, open(target, "wb") as dst:
            dst.write(src.read())

    return target
