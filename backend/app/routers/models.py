import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.config import settings
from app.db.database import get_db
from app.inference.engine import load_model, unload_model, get_loaded_models

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
async def list_models():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM models ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


@router.post("/{model_id}/load")
async def load(model_id: str):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM models WHERE id = ?", (model_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Model not found")
        model = dict(row)
        gguf_path = model.get("gguf_path")
        if not gguf_path or not Path(gguf_path).exists():
            raise HTTPException(400, "No GGUF file found for this model")
        load_model(model_id, gguf_path)
        await db.execute("UPDATE models SET is_loaded = 1 WHERE id = ?", (model_id,))
        await db.commit()
        return {"status": "loaded", "model_id": model_id}
    finally:
        await db.close()


@router.post("/{model_id}/unload")
async def unload(model_id: str):
    unload_model(model_id)
    db = await get_db()
    try:
        await db.execute("UPDATE models SET is_loaded = 0 WHERE id = ?", (model_id,))
        await db.commit()
        return {"status": "unloaded"}
    finally:
        await db.close()


@router.delete("/{model_id}")
async def delete_model(model_id: str):
    unload_model(model_id)
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM models WHERE id = ?", (model_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Model not found")
        model = dict(row)
        # Delete files
        for path_key in ("gguf_path", "adapter_path"):
            p = model.get(path_key)
            if p:
                path = Path(p)
                if path.is_file():
                    path.unlink()
                elif path.is_dir():
                    import shutil
                    shutil.rmtree(path, ignore_errors=True)
        await db.execute("DELETE FROM models WHERE id = ?", (model_id,))
        await db.commit()
        return {"status": "deleted"}
    finally:
        await db.close()


@router.get("/{model_id}/export")
async def export_model(model_id: str):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT gguf_path FROM models WHERE id = ?", (model_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Model not found")
        gguf_path = row["gguf_path"]
        if not gguf_path or not Path(gguf_path).exists():
            raise HTTPException(400, "No GGUF file available")
        return FileResponse(gguf_path, filename=Path(gguf_path).name)
    finally:
        await db.close()
