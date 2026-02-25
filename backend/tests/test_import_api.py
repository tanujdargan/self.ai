import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.config import settings


@pytest.fixture(autouse=True)
def tmp_home(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "selfai_home", tmp_path)
    settings.ensure_dirs()


@pytest.mark.asyncio
async def test_upload_whatsapp():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        content = "12/15/23, 2:30 PM - John: Hello\n12/15/23, 2:31 PM - You: Hi"
        resp = await client.post(
            "/api/import",
            files={"file": ("chat.txt", content, "text/plain")},
            data={"source": "whatsapp"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["message_count"] == 2


@pytest.mark.asyncio
async def test_upload_unsupported_source():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/import",
            files={"file": ("chat.txt", "data", "text/plain")},
            data={"source": "telegram"},
        )
        assert resp.status_code == 400
