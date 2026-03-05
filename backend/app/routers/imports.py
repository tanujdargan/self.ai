import json
import logging
import traceback
import zipfile
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

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
