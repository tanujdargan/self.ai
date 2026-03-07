import json
import logging
import shutil
import traceback
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.db.database import get_db

logger = logging.getLogger("selfai.import")
from app.parsers.whatsapp import parse_whatsapp
from app.parsers.instagram import parse_instagram, parse_instagram_multi
from app.parsers.discord import parse_discord_channel
from app.parsers.email_parser import parse_mbox
from app.utils.zip_extract import extract_email_from_zip, extract_instagram_from_zip, extract_whatsapp_from_zip

router = APIRouter(prefix="/api/import", tags=["import"])

PARSERS = {
    "whatsapp": parse_whatsapp,
    "instagram": parse_instagram,
    "email": parse_mbox,
}


def _parse_instagram_zip(save_path, save_dir):
    """Extract and parse all Instagram DM conversations from a zip."""
    extract_dir = save_dir / "extracted"
    conversations = extract_instagram_from_zip(save_path, extract_dir)
    if not conversations:
        raise ValueError("No Instagram DM conversations found in zip")

    results = []
    for thread_name, json_paths in conversations.items():
        parsed = parse_instagram_multi(json_paths)
        results.append(parsed)
    return results


def _parse_whatsapp_zip(save_path, save_dir):
    """Extract and parse WhatsApp chat from a zip."""
    extract_dir = save_dir / "extracted"
    txt_path = extract_whatsapp_from_zip(save_path, extract_dir)
    return parse_whatsapp(txt_path)


@router.post("")
async def upload_chat(
    file: UploadFile = File(...),
    source: str = Form(...),
):
    logger.info("Import request: source=%s file=%s size=%s", source, file.filename, file.size)

    if source not in PARSERS and source not in ("discord", "imessage"):
        raise HTTPException(400, f"Unsupported source: {source}")

    # Check for duplicate import
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT COUNT(*) as cnt FROM conversations WHERE file_name = ? AND source = ?",
            (file.filename, source),
        )
        row = await cursor.fetchone()
        if row["cnt"] > 0:
            logger.info("Duplicate import skipped: %s (%s) already imported", file.filename, source)
            raise HTTPException(409, f"'{file.filename}' has already been imported as {source}. Delete existing data first to re-import.")
    finally:
        await db.close()

    # Save uploaded file
    import_id = uuid4().hex[:12]
    save_dir = settings.imports_dir / import_id
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / file.filename

    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Parse
    try:
        if zipfile.is_zipfile(save_path):
            if source == "instagram":
                result = _parse_instagram_zip(save_path, save_dir)
            elif source == "whatsapp":
                result = _parse_whatsapp_zip(save_path, save_dir)
            elif source == "email":
                extract_dir = save_dir / "extracted"
                mbox_path = extract_email_from_zip(save_path, extract_dir)
                result = parse_mbox(mbox_path)
            else:
                raise HTTPException(400, f"Zip upload not supported for {source}")
        elif source in PARSERS:
            result = PARSERS[source](save_path)
        else:
            raise HTTPException(400, f"Parser for {source} not yet integrated via upload")

        if isinstance(result, list):
            total_messages = sum(len(r["messages"]) for r in result)
        else:
            total_messages = len(result["messages"])
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Parse failed for %s (%s): %s\n%s", file.filename, source, e, traceback.format_exc())
        raise HTTPException(422, f"Failed to parse: {str(e)}")

    # Save parsed result
    parsed_path = settings.parsed_dir / f"{import_id}.json"
    parsed_data = result if not isinstance(result, list) else result
    parsed_path.write_text(json.dumps(parsed_data, indent=2, default=str))

    # Persist to DB for import history
    convos = result if isinstance(result, list) else [result]
    db = await get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        for convo in convos:
            participants = convo.get("participants", [])
            msg_count = len(convo.get("messages", []))
            await db.execute(
                "INSERT INTO conversations (id, source, file_name, participant_self, participants_json, message_count, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (uuid4().hex[:12], source, file.filename, "", json.dumps(participants), msg_count, now),
            )
        await db.commit()
    finally:
        await db.close()

    logger.info("Import complete: id=%s source=%s file=%s messages=%d convos=%d",
                import_id, source, file.filename, total_messages, len(convos))

    return {
        "import_id": import_id,
        "source": source,
        "file_name": file.filename,
        "message_count": total_messages,
        "status": "parsed",
    }


class PathImportRequest(BaseModel):
    path: str
    source: str


@router.post("/from-path")
async def import_from_path(req: PathImportRequest):
    """Import chat files from a server-side path (file or directory)."""
    source = req.source
    if source not in PARSERS and source not in ("discord", "imessage"):
        raise HTTPException(400, f"Unsupported source: {source}")

    target = Path(req.path)
    if not target.exists():
        raise HTTPException(404, f"Path not found: {req.path}")

    # Collect files to process
    if target.is_file():
        files = [target]
    elif target.is_dir():
        files = sorted(f for f in target.iterdir() if f.is_file() and not f.name.startswith("."))
        if not files:
            raise HTTPException(400, f"No files found in directory: {req.path}")
    else:
        raise HTTPException(400, f"Path is not a file or directory: {req.path}")

    results = []
    errors = []

    for file_path in files:
        import_id = uuid4().hex[:12]
        save_dir = settings.imports_dir / import_id
        save_dir.mkdir(parents=True, exist_ok=True)

        # Copy file into imports dir (keeps originals untouched)
        save_path = save_dir / file_path.name
        shutil.copy2(file_path, save_path)

        # Check for duplicate
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT COUNT(*) as cnt FROM conversations WHERE file_name = ? AND source = ?",
                (file_path.name, source),
            )
            row = await cursor.fetchone()
            if row["cnt"] > 0:
                errors.append({"file": file_path.name, "error": "Already imported"})
                continue
        finally:
            await db.close()

        # Parse
        try:
            if zipfile.is_zipfile(save_path):
                if source == "instagram":
                    result = _parse_instagram_zip(save_path, save_dir)
                elif source == "whatsapp":
                    result = _parse_whatsapp_zip(save_path, save_dir)
                elif source == "email":
                    extract_dir = save_dir / "extracted"
                    mbox_path = extract_email_from_zip(save_path, extract_dir)
                    result = parse_mbox(mbox_path)
                else:
                    errors.append({"file": file_path.name, "error": f"Zip not supported for {source}"})
                    continue
            elif source in PARSERS:
                result = PARSERS[source](save_path)
            else:
                errors.append({"file": file_path.name, "error": f"Parser not available for {source}"})
                continue

            if isinstance(result, list):
                total_messages = sum(len(r["messages"]) for r in result)
            else:
                total_messages = len(result["messages"])
        except Exception as e:
            logger.error("Parse failed for %s (%s): %s\n%s", file_path.name, source, e, traceback.format_exc())
            errors.append({"file": file_path.name, "error": str(e)})
            continue

        # Save parsed result
        parsed_path = settings.parsed_dir / f"{import_id}.json"
        parsed_data = result if not isinstance(result, list) else result
        parsed_path.write_text(json.dumps(parsed_data, indent=2, default=str))

        # Persist to DB
        convos = result if isinstance(result, list) else [result]
        db = await get_db()
        try:
            now = datetime.now(timezone.utc).isoformat()
            for convo in convos:
                participants = convo.get("participants", [])
                msg_count = len(convo.get("messages", []))
                await db.execute(
                    "INSERT INTO conversations (id, source, file_name, participant_self, participants_json, message_count, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (uuid4().hex[:12], source, file_path.name, "", json.dumps(participants), msg_count, now),
                )
            await db.commit()
        finally:
            await db.close()

        results.append({
            "import_id": import_id,
            "file_name": file_path.name,
            "message_count": total_messages,
        })
        logger.info("Path import: id=%s source=%s file=%s messages=%d", import_id, source, file_path.name, total_messages)

    return {
        "source": source,
        "imported": results,
        "errors": errors,
        "total_files": len(results) + len(errors),
        "total_messages": sum(r["message_count"] for r in results),
    }
