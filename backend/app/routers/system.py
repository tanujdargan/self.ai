import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.db.database import get_db
from app.services.hardware import detect_hardware

logger = logging.getLogger("selfai.system")

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/hardware")
async def get_hardware():
    return detect_hardware()


class TokenBody(BaseModel):
    token: str


@router.get("/hf-token")
async def get_hf_token():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT value FROM app_settings WHERE key = 'hf_token'")
        row = await cursor.fetchone()
        if row:
            token = row["value"]
            # Mask for display: show first 4 and last 4 chars
            masked = token[:4] + "..." + token[-4:] if len(token) > 8 else "***"
            return {"has_token": True, "masked": masked}
        return {"has_token": False, "masked": None}
    finally:
        await db.close()


@router.put("/hf-token")
async def set_hf_token(body: TokenBody):
    db = await get_db()
    try:
        await db.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('hf_token', ?)",
            (body.token,),
        )
        await db.commit()
        logger.info("HuggingFace token saved")
        return {"status": "saved"}
    finally:
        await db.close()


@router.delete("/hf-token")
async def delete_hf_token():
    db = await get_db()
    try:
        await db.execute("DELETE FROM app_settings WHERE key = 'hf_token'")
        await db.commit()
        return {"status": "deleted"}
    finally:
        await db.close()
