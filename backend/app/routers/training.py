import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app.models.schemas import TrainingConfig
from app.training.manager import cancel_training, start_training, subscribe, unsubscribe

logger = logging.getLogger("selfai.train")

router = APIRouter(tags=["training"])


@router.post("/api/train")
async def begin_training(config: TrainingConfig):
    logger.info("Training requested: mode=%s model=%s self_name=%s", config.mode, config.base_model, config.self_name)
    try:
        result = await start_training(config.model_dump())
    except ValueError as e:
        logger.warning("Training rejected: %s", e)
        return JSONResponse(status_code=422, content={"detail": str(e)})
    except Exception:
        logger.exception("Training start failed unexpectedly")
        return JSONResponse(status_code=500, content={"detail": "Internal error starting training. Check server logs."})
    logger.info("Training started: run_id=%s self_name=%s", result["run_id"], result["detected_self_name"])
    return {
        "run_id": result["run_id"],
        "status": "started",
        "detected_self_name": result["detected_self_name"],
    }


@router.post("/api/train/{run_id}/cancel")
async def cancel(run_id: str):
    if cancel_training(run_id):
        return {"status": "cancelled"}
    return {"status": "not_found"}


@router.websocket("/ws/train/{run_id}")
async def training_ws(websocket: WebSocket, run_id: str):
    await websocket.accept()
    queue = subscribe(run_id)
    try:
        while True:
            data = await queue.get()
            await websocket.send_json(data)
            if data.get("event") in ("complete", "error", "finished"):
                break
    except WebSocketDisconnect:
        pass
    finally:
        unsubscribe(run_id, queue)
