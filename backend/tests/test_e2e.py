"""End-to-end integration test for the Self.ai API flow."""

import json
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db.database import get_db, init_db
from app.main import app


@pytest.fixture(autouse=True)
def setup_env(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "selfai_home", tmp_path)
    settings.ensure_dirs()


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_import_then_check_file_saved(client):
    async with client as c:
        resp = await c.post(
            "/api/import",
            files={"file": ("chat.txt", "12/15/23, 2:30 PM - John: Hello\n12/15/23, 2:31 PM - You: Hi there", "text/plain")},
            data={"source": "whatsapp"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "whatsapp"
    assert data["message_count"] == 2
    assert data["status"] == "parsed"

    parsed_file = settings.parsed_dir / f"{data['import_id']}.json"
    assert parsed_file.exists()
    parsed = json.loads(parsed_file.read_text())
    assert parsed["source"] == "whatsapp"


@pytest.mark.asyncio
async def test_data_stats_empty(client):
    await init_db()
    async with client as c:
        resp = await c.get("/api/data/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["conversations"] == 0
    assert data["total_messages"] == 0


@pytest.mark.asyncio
async def test_models_empty_then_crud(client):
    await init_db()
    async with client as c:
        resp = await c.get("/api/models")
        assert resp.status_code == 200
        assert resp.json() == []

        db = await get_db()
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "INSERT INTO models (id, name, mode, base_model, created_at) VALUES (?, ?, ?, ?, ?)",
            ("test-model", "Test Model", "style", "meta-llama/Llama-3.2-3B", now),
        )
        await db.commit()
        await db.close()

        resp = await c.get("/api/models")
        assert resp.status_code == 200
        models = resp.json()
        assert len(models) == 1
        assert models[0]["name"] == "Test Model"

        resp = await c.delete("/api/models/test-model")
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

        resp = await c.get("/api/models")
        assert resp.json() == []


@pytest.mark.asyncio
async def test_data_wipe(client):
    await init_db()
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO conversations (id, source, file_name, participant_self, participants_json, message_count, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("conv-1", "whatsapp", "chat.txt", "You", '["You","John"]', 5, now),
    )
    await db.commit()
    await db.close()

    async with client as c:
        resp = await c.get("/api/data/stats")
        assert resp.json()["conversations"] == 1

        resp = await c.delete("/api/data")
        assert resp.status_code == 200
        assert resp.json()["status"] == "wiped"

        resp = await c.get("/api/data/stats")
        assert resp.json()["conversations"] == 0


@pytest.mark.asyncio
async def test_hardware_endpoint(client):
    async with client as c:
        resp = await c.get("/api/system/hardware")
    assert resp.status_code == 200
    data = resp.json()
    assert "gpu_type" in data
    assert "ram_gb" in data
    assert data["ram_gb"] > 0


@pytest.mark.asyncio
async def test_health_endpoint(client):
    async with client as c:
        resp = await c.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
