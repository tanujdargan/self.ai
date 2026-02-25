from fastapi import APIRouter
from app.services.hardware import detect_hardware

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/hardware")
async def get_hardware():
    return detect_hardware()
