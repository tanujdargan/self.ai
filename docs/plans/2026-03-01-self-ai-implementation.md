# Self.ai Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a fully local LLM finetuning platform that trains on personal chat history, with a chat-first UI and comprehensive training controls.

**Architecture:** Monorepo with FastAPI backend serving a Vite+React frontend. Training runs as background subprocess with WebSocket progress. Inference via llama-cpp-python. SQLite for metadata.

**Tech Stack:** Python 3.10+, FastAPI, SQLite/aiosqlite, HuggingFace Transformers, PEFT, bitsandbytes, llama-cpp-python, Vite, React, TanStack Router, TanStack Query, Tailwind CSS

---

## Phase 1: Project Scaffolding & Backend Foundation

### Task 1: Initialize monorepo structure

**Files:**
- Create: `backend/` directory structure
- Create: `frontend/` directory structure
- Create: `pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`

**Step 1: Create the monorepo directory layout**

```
self.ai/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI entry point
│   │   ├── config.py         # Settings, paths, constants
│   │   ├── routers/          # API route modules
│   │   │   └── __init__.py
│   │   ├── services/         # Business logic
│   │   │   └── __init__.py
│   │   ├── parsers/          # Chat import parsers
│   │   │   └── __init__.py
│   │   ├── training/         # ML training pipeline
│   │   │   └── __init__.py
│   │   ├── inference/        # llama.cpp inference
│   │   │   └── __init__.py
│   │   ├── models/           # Pydantic schemas
│   │   │   └── __init__.py
│   │   └── db/               # Database layer
│   │       └── __init__.py
│   ├── tests/
│   │   └── __init__.py
│   └── requirements.txt
├── frontend/                 # (scaffolded in Task 3)
├── scripts/                  # Install/launcher scripts
├── docs/plans/
└── pyproject.toml
```

**Step 2: Write `backend/app/config.py`**

```python
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Self.ai"
    host: str = "127.0.0.1"
    port: int = 8420
    selfai_home: Path = Path.home() / ".selfai"

    @property
    def data_dir(self) -> Path:
        return self.selfai_home / "data"

    @property
    def imports_dir(self) -> Path:
        return self.data_dir / "imports"

    @property
    def parsed_dir(self) -> Path:
        return self.data_dir / "parsed"

    @property
    def training_dir(self) -> Path:
        return self.data_dir / "training"

    @property
    def models_dir(self) -> Path:
        return self.selfai_home / "models"

    @property
    def base_models_dir(self) -> Path:
        return self.models_dir / "base"

    @property
    def adapters_dir(self) -> Path:
        return self.models_dir / "adapters"

    @property
    def merged_dir(self) -> Path:
        return self.models_dir / "merged"

    @property
    def db_path(self) -> Path:
        return self.selfai_home / "db" / "selfai.db"

    @property
    def logs_dir(self) -> Path:
        return self.selfai_home / "logs"

    def ensure_dirs(self) -> None:
        for d in [
            self.imports_dir, self.parsed_dir, self.training_dir,
            self.base_models_dir, self.adapters_dir, self.merged_dir,
            self.db_path.parent, self.logs_dir,
        ]:
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
```

**Step 3: Write `backend/app/main.py`**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    # TODO: init database
    yield
    # TODO: cleanup


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
```

**Step 4: Write `backend/requirements.txt`**

```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
pydantic-settings>=2.0.0
aiosqlite>=0.20.0
python-multipart>=0.0.9
email-reply-parser>=0.5.0
```

**Step 5: Write `pyproject.toml`**

```toml
[project]
name = "selfai"
version = "0.1.0"
description = "Finetune LLMs on your personal chat history, fully local"
requires-python = ">=3.10"
```

**Step 6: Create all `__init__.py` files and test the server starts**

Run:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8420
```
Then: `curl http://localhost:8420/api/health` → `{"status":"ok","app":"Self.ai"}`

**Step 7: Commit**

```bash
git add -A
git commit -m "scaffold monorepo with fastapi backend"
```

---

### Task 2: SQLite database layer

**Files:**
- Create: `backend/app/db/database.py`
- Create: `backend/app/db/schema.sql`
- Create: `backend/app/models/schemas.py`
- Modify: `backend/app/main.py` (add db init to lifespan)
- Create: `backend/tests/test_db.py`

**Step 1: Write `backend/app/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,        -- whatsapp, instagram, imessage, discord, email
    file_name TEXT NOT NULL,
    participant_self TEXT NOT NULL,
    participants_json TEXT NOT NULL,  -- JSON array
    message_count INTEGER DEFAULT 0,
    imported_at TEXT NOT NULL,
    status TEXT DEFAULT 'imported'   -- imported, parsed, ready
);

CREATE TABLE IF NOT EXISTS training_runs (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,              -- style, insights
    base_model TEXT NOT NULL,
    config_json TEXT NOT NULL,       -- full training config as JSON
    status TEXT DEFAULT 'pending',   -- pending, running, completed, failed, cancelled
    started_at TEXT,
    completed_at TEXT,
    metrics_json TEXT,               -- loss curves, eval metrics
    output_path TEXT,                -- path to adapter/merged model
    error TEXT
);

CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,              -- style, insights
    base_model TEXT NOT NULL,
    training_run_id TEXT REFERENCES training_runs(id),
    gguf_path TEXT,
    adapter_path TEXT,
    created_at TEXT NOT NULL,
    is_loaded INTEGER DEFAULT 0,
    config_json TEXT
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    model_id TEXT REFERENCES models(id),
    mode TEXT NOT NULL,              -- style, insights
    created_at TEXT NOT NULL,
    title TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES chat_sessions(id),
    role TEXT NOT NULL,              -- user, assistant
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
```

**Step 2: Write `backend/app/db/database.py`**

```python
import aiosqlite
from pathlib import Path

from app.config import settings

_DB_SCHEMA = (Path(__file__).parent / "schema.sql").read_text()


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(settings.db_path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db() -> None:
    db = await get_db()
    try:
        await db.executescript(_DB_SCHEMA)
        await db.commit()
    finally:
        await db.close()
```

**Step 3: Write `backend/app/models/schemas.py`** — Pydantic models for API request/response

```python
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel


class Message(BaseModel):
    sender: str
    timestamp: datetime
    content: str
    type: Literal["text", "media", "system"] = "text"


class Conversation(BaseModel):
    source: str
    conversation_id: str
    participants: list[str]
    messages: list[Message]


class TrainingConfig(BaseModel):
    mode: Literal["style", "insights"]
    base_model: str
    preset: Literal["quick", "balanced", "max_quality", "custom"] = "balanced"
    # Core
    quantization: Literal["4bit", "8bit", "none"] = "4bit"
    lora_rank: int = 16
    lora_alpha: int | None = None  # None = auto (2 * rank)
    lora_dropout: float = 0.05
    learning_rate: float = 2e-4
    lr_scheduler: str = "cosine"
    num_epochs: int = 3
    max_steps: int = -1
    batch_size: int = 4
    gradient_accumulation_steps: int = 4
    # Sequence & Data
    max_seq_length: int = 2048
    packing: bool = False
    dataset_split: float = 0.1
    shuffle_seed: int = 42
    # Regularization
    weight_decay: float = 0.01
    warmup_ratio: float = 0.03
    max_grad_norm: float = 0.3
    # Checkpointing
    save_steps: int = 100
    max_checkpoints: int = 3
    logging_steps: int = 10
    eval_steps: int = 100
    early_stopping: bool = False
    early_stopping_patience: int = 3
    # LoRA targets
    target_modules: list[str] = [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ]
    # Output
    gguf_quantization: str = "Q4_K_M"
    merge_before_convert: bool = True
    keep_adapter: bool = True


class TrainingRunResponse(BaseModel):
    id: str
    mode: str
    base_model: str
    status: str
    started_at: str | None
    completed_at: str | None
    metrics: dict | None = None
    error: str | None = None


class ModelResponse(BaseModel):
    id: str
    name: str
    mode: str
    base_model: str
    gguf_path: str | None
    created_at: str
    is_loaded: bool


class HardwareInfo(BaseModel):
    gpu_type: Literal["nvidia", "apple_silicon", "amd", "cpu"]
    gpu_name: str | None = None
    vram_gb: float | None = None
    ram_gb: float
    cuda_version: str | None = None
    rocm_version: str | None = None
```

**Step 4: Update `backend/app/main.py` to init DB in lifespan**

Add `from app.db.database import init_db` and call `await init_db()` in the lifespan.

**Step 5: Write test `backend/tests/test_db.py`**

```python
import pytest
import aiosqlite
import tempfile
from pathlib import Path

from app.db.database import init_db, get_db
from app.config import settings


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "selfai_home", tmp_path)
    settings.ensure_dirs()


@pytest.mark.asyncio
async def test_init_db_creates_tables():
    await init_db()
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = {row[0] for row in await cursor.fetchall()}
        assert "conversations" in tables
        assert "training_runs" in tables
        assert "models" in tables
        assert "chat_sessions" in tables
        assert "chat_messages" in tables
    finally:
        await db.close()
```

**Step 6: Run test**

```bash
pip install pytest pytest-asyncio
pytest tests/test_db.py -v
```
Expected: PASS

**Step 7: Commit**

```bash
git add -A
git commit -m "add sqlite database layer and schemas"
```

---

### Task 3: Scaffold frontend with Vite + React + TanStack

**Files:**
- Create: `frontend/` (via Vite scaffold)
- Create: `frontend/src/routes/` (TanStack Router setup)
- Modify: `frontend/package.json` (add deps)

**Step 1: Scaffold Vite + React + TypeScript**

```bash
cd /path/to/self.ai
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Install TanStack and Tailwind deps**

```bash
npm install @tanstack/react-router @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Configure Tailwind** — update `frontend/src/index.css`:

```css
@import "tailwindcss";
```

Update `frontend/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8420",
      "/v1": "http://127.0.0.1:8420",
      "/ws": {
        target: "ws://127.0.0.1:8420",
        ws: true,
      },
    },
  },
});
```

**Step 4: Set up TanStack Router** — Create `frontend/src/router.tsx`:

```tsx
import {
  createRouter,
  createRoute,
  createRootRoute,
} from "@tanstack/react-router";
import { RootLayout } from "./layouts/RootLayout";
import { HomePage } from "./pages/HomePage";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/import",
  component: () => <div>Import</div>,
});

const trainRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/train",
  component: () => <div>Train</div>,
});

const modelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/models",
  component: () => <div>Models</div>,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$sessionId",
  component: () => <div>Chat</div>,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => <div>Settings</div>,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  importRoute,
  trainRoute,
  modelsRoute,
  chatRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

**Step 5: Create placeholder layout and home page**

Create `frontend/src/layouts/RootLayout.tsx`:

```tsx
import { Outlet } from "@tanstack/react-router";

export function RootLayout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Outlet />
    </div>
  );
}
```

Create `frontend/src/pages/HomePage.tsx`:

```tsx
export function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold">Self.ai</h1>
      <p className="text-zinc-400 mt-2">Your personal AI, trained on you.</p>
    </div>
  );
}
```

**Step 6: Update `frontend/src/App.tsx`** and `frontend/src/main.tsx`:

`main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
```

Delete `App.tsx` and `App.css` — not needed.

**Step 7: Verify dev server runs**

```bash
cd frontend && npm run dev
```
Visit `http://localhost:5173` — should show "Self.ai" centered on dark background.

**Step 8: Commit**

```bash
git add -A
git commit -m "scaffold frontend with vite react tanstack tailwind"
```

---

## Phase 2: Chat Import Parsers

### Task 4: WhatsApp parser

**Files:**
- Create: `backend/app/parsers/whatsapp.py`
- Create: `backend/tests/test_whatsapp_parser.py`
- Create: `backend/tests/fixtures/whatsapp_sample.txt`

**Step 1: Create test fixture** `backend/tests/fixtures/whatsapp_sample.txt`:

```
12/15/23, 2:30 PM - John: Hey what's up
12/15/23, 2:31 PM - You: Not much, just coding
12/15/23, 2:31 PM - You: How about you?
12/15/23, 2:32 PM - John: Same here lol
12/15/23, 2:33 PM - John: Check this out
it's a multiline message
12/15/23, 2:35 PM - You: Nice!
12/15/23, 2:36 PM - John: <Media omitted>
12/15/23, 2:40 PM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.
```

**Step 2: Write failing test** `backend/tests/test_whatsapp_parser.py`:

```python
import pytest
from pathlib import Path
from app.parsers.whatsapp import parse_whatsapp

FIXTURE = Path(__file__).parent / "fixtures" / "whatsapp_sample.txt"


def test_parse_whatsapp_extracts_messages():
    result = parse_whatsapp(FIXTURE)
    assert result["source"] == "whatsapp"
    assert set(result["participants"]) == {"John", "You"}
    # Should exclude system messages and media
    text_msgs = [m for m in result["messages"] if m["type"] == "text"]
    assert len(text_msgs) == 5  # excludes media and system


def test_parse_whatsapp_handles_multiline():
    result = parse_whatsapp(FIXTURE)
    multiline = [m for m in result["messages"] if "multiline" in m["content"]]
    assert len(multiline) == 1
    assert "it's a multiline message" in multiline[0]["content"]
```

**Step 3: Run tests to verify they fail**

```bash
pytest tests/test_whatsapp_parser.py -v
```
Expected: FAIL — module not found.

**Step 4: Implement** `backend/app/parsers/whatsapp.py`:

```python
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

# Matches: "MM/DD/YY, H:MM AM/PM - Sender: Message"
# Also handles DD/MM/YY and 24h formats
LINE_RE = re.compile(
    r"^(\d{1,2}/\d{1,2}/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s+-\s+(.+?):\s(.+)$"
)

SYSTEM_INDICATORS = [
    "Messages and calls are end-to-end encrypted",
    "created group",
    "added you",
    "changed the subject",
    "changed this group",
    "left",
    "removed",
    "changed the group",
    "You were added",
]

MEDIA_INDICATORS = ["<Media omitted>", "<image omitted>", "<video omitted>", "<audio omitted>"]

DATE_FORMATS = [
    "%m/%d/%y, %I:%M %p",
    "%d/%m/%y, %I:%M %p",
    "%m/%d/%Y, %I:%M %p",
    "%d/%m/%Y, %I:%M %p",
    "%m/%d/%y, %H:%M",
    "%d/%m/%y, %H:%M",
]


def _parse_timestamp(ts_str: str) -> datetime:
    ts_clean = ts_str.strip().replace("\u202f", " ").replace("\u200e", "")
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(ts_clean, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse timestamp: {ts_str!r}")


def _is_system_message(content: str) -> bool:
    return any(indicator in content for indicator in SYSTEM_INDICATORS)


def _is_media_message(content: str) -> bool:
    return any(indicator in content for indicator in MEDIA_INDICATORS)


def parse_whatsapp(file_path: Path) -> dict:
    text = file_path.read_text(encoding="utf-8")
    lines = text.splitlines()

    messages = []
    participants = set()
    current_msg = None

    for line in lines:
        match = LINE_RE.match(line)
        if match:
            # Save previous message
            if current_msg:
                messages.append(current_msg)

            ts_str, sender, content = match.groups()
            participants.add(sender)

            if _is_system_message(content):
                current_msg = None
                continue

            msg_type = "media" if _is_media_message(content) else "text"
            current_msg = {
                "sender": sender,
                "timestamp": _parse_timestamp(ts_str).isoformat(),
                "content": content,
                "type": msg_type,
            }
        elif current_msg:
            # Continuation of multiline message
            current_msg["content"] += "\n" + line

    # Don't forget the last message
    if current_msg:
        messages.append(current_msg)

    return {
        "source": "whatsapp",
        "conversation_id": uuid4().hex[:12],
        "participants": sorted(participants),
        "messages": messages,
    }
```

**Step 5: Run tests**

```bash
pytest tests/test_whatsapp_parser.py -v
```
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "add whatsapp chat parser"
```

---

### Task 5: Instagram parser

**Files:**
- Create: `backend/app/parsers/instagram.py`
- Create: `backend/tests/test_instagram_parser.py`
- Create: `backend/tests/fixtures/instagram_sample.json`

**Step 1: Create test fixture** `backend/tests/fixtures/instagram_sample.json`:

```json
{
  "participants": [
    {"name": "You"},
    {"name": "JohnDoe"}
  ],
  "messages": [
    {
      "sender_name": "JohnDoe",
      "timestamp_ms": 1702656000000,
      "content": "Hey what's up",
      "type": "Generic"
    },
    {
      "sender_name": "You",
      "timestamp_ms": 1702656060000,
      "content": "Not much, coding",
      "type": "Generic"
    },
    {
      "sender_name": "JohnDoe",
      "timestamp_ms": 1702656120000,
      "type": "Share",
      "share": {"link": "https://example.com"}
    }
  ],
  "title": "JohnDoe",
  "is_still_participant": true
}
```

**Step 2: Write failing test** `backend/tests/test_instagram_parser.py`:

```python
import pytest
from pathlib import Path
from app.parsers.instagram import parse_instagram

FIXTURE = Path(__file__).parent / "fixtures" / "instagram_sample.json"


def test_parse_instagram_extracts_messages():
    result = parse_instagram(FIXTURE)
    assert result["source"] == "instagram"
    assert set(result["participants"]) == {"JohnDoe", "You"}
    text_msgs = [m for m in result["messages"] if m["type"] == "text"]
    assert len(text_msgs) == 2


def test_parse_instagram_handles_shares_as_media():
    result = parse_instagram(FIXTURE)
    media_msgs = [m for m in result["messages"] if m["type"] == "media"]
    assert len(media_msgs) == 1
```

**Step 3: Run test to verify it fails**

```bash
pytest tests/test_instagram_parser.py -v
```

**Step 4: Implement** `backend/app/parsers/instagram.py`:

```python
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def _fix_encoding(text: str) -> str:
    """Instagram exports use latin-1 encoded UTF-8 sequences."""
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return text


def parse_instagram(file_path: Path) -> dict:
    data = json.loads(file_path.read_text(encoding="utf-8"))

    participants = [_fix_encoding(p["name"]) for p in data.get("participants", [])]
    raw_messages = data.get("messages", [])

    messages = []
    for msg in reversed(raw_messages):  # Instagram stores newest first
        sender = _fix_encoding(msg.get("sender_name", "Unknown"))
        ts = datetime.fromtimestamp(
            msg["timestamp_ms"] / 1000, tz=timezone.utc
        ).isoformat()

        content = msg.get("content")
        if content:
            content = _fix_encoding(content)
            msg_type = "text"
        elif msg.get("share") or msg.get("photos") or msg.get("videos") or msg.get("audio_files"):
            content = msg.get("share", {}).get("link", "[media]")
            msg_type = "media"
        else:
            continue

        messages.append({
            "sender": sender,
            "timestamp": ts,
            "content": content,
            "type": msg_type,
        })

    return {
        "source": "instagram",
        "conversation_id": uuid4().hex[:12],
        "participants": sorted(participants),
        "messages": messages,
    }
```

**Step 5: Run tests**

```bash
pytest tests/test_instagram_parser.py -v
```
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "add instagram chat parser"
```

---

### Task 6: Discord parser

**Files:**
- Create: `backend/app/parsers/discord.py`
- Create: `backend/tests/test_discord_parser.py`
- Create: `backend/tests/fixtures/discord_sample/` (directory with channel JSON)

**Step 1: Create test fixture** `backend/tests/fixtures/discord_sample/channel001/messages.json`:

Discord GDPR exports have a `messages/` directory containing folders per channel, each with a `messages.json`.

```json
[
  {
    "ID": "1001",
    "Timestamp": "2024-01-15T14:30:00.000+00:00",
    "Contents": "Hey everyone",
    "Author": {"id": "111", "username": "You", "discriminator": "0"}
  },
  {
    "ID": "1002",
    "Timestamp": "2024-01-15T14:31:00.000+00:00",
    "Contents": "What's up",
    "Author": {"id": "222", "username": "JohnDoe", "discriminator": "0"}
  },
  {
    "ID": "1003",
    "Timestamp": "2024-01-15T14:32:00.000+00:00",
    "Contents": "",
    "Author": {"id": "111", "username": "You", "discriminator": "0"},
    "Attachments": "image.png"
  }
]
```

Also create `backend/tests/fixtures/discord_sample/channel001/channel.json`:

```json
{
  "id": "channel001",
  "type": 1,
  "name": "Direct Message with JohnDoe",
  "recipients": ["111", "222"]
}
```

**Step 2: Write failing test** `backend/tests/test_discord_parser.py`:

```python
import pytest
from pathlib import Path
from app.parsers.discord import parse_discord_channel

FIXTURE = Path(__file__).parent / "fixtures" / "discord_sample" / "channel001"


def test_parse_discord_extracts_messages():
    result = parse_discord_channel(FIXTURE)
    assert result["source"] == "discord"
    text_msgs = [m for m in result["messages"] if m["type"] == "text"]
    assert len(text_msgs) == 2


def test_parse_discord_identifies_participants():
    result = parse_discord_channel(FIXTURE)
    assert "You" in result["participants"]
    assert "JohnDoe" in result["participants"]
```

**Step 3: Run test — expect FAIL**

**Step 4: Implement** `backend/app/parsers/discord.py`:

```python
import json
from pathlib import Path
from uuid import uuid4


def parse_discord_channel(channel_dir: Path) -> dict:
    messages_file = channel_dir / "messages.json"
    data = json.loads(messages_file.read_text(encoding="utf-8"))

    participants = set()
    messages = []

    for msg in data:
        author = msg.get("Author", {})
        sender = author.get("username", "Unknown")
        participants.add(sender)

        content = msg.get("Contents", "").strip()
        has_attachment = bool(msg.get("Attachments"))

        if not content and not has_attachment:
            continue

        msg_type = "text" if content else "media"
        if not content:
            content = "[attachment]"

        messages.append({
            "sender": sender,
            "timestamp": msg["Timestamp"],
            "content": content,
            "type": msg_type,
        })

    return {
        "source": "discord",
        "conversation_id": uuid4().hex[:12],
        "participants": sorted(participants),
        "messages": messages,
    }
```

**Step 5: Run tests — expect PASS**

**Step 6: Commit**

```bash
git add -A
git commit -m "add discord chat parser"
```

---

### Task 7: iMessage parser

**Files:**
- Create: `backend/app/parsers/imessage.py`
- Create: `backend/tests/test_imessage_parser.py`

**Step 1: Write failing test** (uses an in-memory SQLite DB mimicking iMessage schema):

```python
import pytest
import sqlite3
import tempfile
from pathlib import Path
from app.parsers.imessage import parse_imessage


@pytest.fixture
def fake_chat_db(tmp_path):
    db_path = tmp_path / "chat.db"
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
        CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT);
        CREATE TABLE message (
            ROWID INTEGER PRIMARY KEY,
            text TEXT,
            handle_id INTEGER,
            date INTEGER,
            is_from_me INTEGER,
            cache_has_attachments INTEGER DEFAULT 0
        );
        CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);

        INSERT INTO handle VALUES (1, '+1234567890');
        INSERT INTO chat VALUES (1, 'John');
        INSERT INTO message VALUES (1, 'Hey there', 1, 700000000000000000, 0, 0);
        INSERT INTO message VALUES (2, 'Hi!', 0, 700000060000000000, 1, 0);
        INSERT INTO message VALUES (3, NULL, 1, 700000120000000000, 0, 1);
        INSERT INTO chat_message_join VALUES (1, 1);
        INSERT INTO chat_message_join VALUES (1, 2);
        INSERT INTO chat_message_join VALUES (1, 3);
    """)
    conn.close()
    return db_path


def test_parse_imessage_extracts_text(fake_chat_db):
    results = parse_imessage(fake_chat_db)
    assert len(results) >= 1
    convo = results[0]
    assert convo["source"] == "imessage"
    text_msgs = [m for m in convo["messages"] if m["type"] == "text"]
    assert len(text_msgs) == 2
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement** `backend/app/parsers/imessage.py`:

```python
import sqlite3
import platform
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

# iMessage stores dates as nanoseconds since 2001-01-01
IMESSAGE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)


def _convert_timestamp(ns: int) -> str:
    seconds = ns / 1_000_000_000
    dt = IMESSAGE_EPOCH.timestamp() + seconds
    return datetime.fromtimestamp(dt, tz=timezone.utc).isoformat()


def parse_imessage(db_path: Path) -> list[dict]:
    if platform.system() != "Darwin" and "test" not in str(db_path):
        raise RuntimeError("iMessage parsing is only supported on macOS")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Get all chats
    chats = conn.execute("SELECT ROWID, display_name FROM chat").fetchall()

    results = []
    for chat in chats:
        chat_id = chat["ROWID"]
        chat_name = chat["display_name"] or "Unknown"

        rows = conn.execute("""
            SELECT m.text, m.date, m.is_from_me, m.cache_has_attachments,
                   h.id as handle_id
            FROM message m
            JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
            LEFT JOIN handle h ON h.ROWID = m.handle_id
            WHERE cmj.chat_id = ?
            ORDER BY m.date ASC
        """, (chat_id,)).fetchall()

        participants = set()
        messages = []

        for row in rows:
            sender = "me" if row["is_from_me"] else (row["handle_id"] or chat_name)
            participants.add(sender)

            if row["text"]:
                messages.append({
                    "sender": sender,
                    "timestamp": _convert_timestamp(row["date"]),
                    "content": row["text"],
                    "type": "text",
                })
            elif row["cache_has_attachments"]:
                messages.append({
                    "sender": sender,
                    "timestamp": _convert_timestamp(row["date"]),
                    "content": "[attachment]",
                    "type": "media",
                })

        if messages:
            results.append({
                "source": "imessage",
                "conversation_id": uuid4().hex[:12],
                "participants": sorted(participants),
                "messages": messages,
            })

    conn.close()
    return results
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add -A
git commit -m "add imessage chat parser"
```

---

### Task 8: Email parser

**Files:**
- Create: `backend/app/parsers/email_parser.py`
- Create: `backend/tests/test_email_parser.py`
- Create: `backend/tests/fixtures/sample.mbox`

**Step 1: Create test fixture** — a minimal `.mbox` file at `backend/tests/fixtures/sample.mbox`:

```
From sender@example.com Fri Jan 15 14:30:00 2024
From: John <john@example.com>
To: You <you@example.com>
Subject: Hello
Date: Mon, 15 Jan 2024 14:30:00 +0000
Message-ID: <msg001@example.com>

Hey, how are you?

From you@example.com Fri Jan 15 14:35:00 2024
From: You <you@example.com>
To: John <john@example.com>
Subject: Re: Hello
Date: Mon, 15 Jan 2024 14:35:00 +0000
Message-ID: <msg002@example.com>
In-Reply-To: <msg001@example.com>

I'm great! Working on a project.

> Hey, how are you?
```

**Step 2: Write failing test**:

```python
import pytest
from pathlib import Path
from app.parsers.email_parser import parse_mbox

FIXTURE = Path(__file__).parent / "fixtures" / "sample.mbox"


def test_parse_mbox_extracts_messages():
    results = parse_mbox(FIXTURE)
    assert len(results) >= 1
    convo = results[0]
    assert convo["source"] == "email"
    assert len(convo["messages"]) == 2


def test_parse_mbox_strips_quoted_replies():
    results = parse_mbox(FIXTURE)
    convo = results[0]
    reply = [m for m in convo["messages"] if "great" in m["content"]][0]
    # email-reply-parser should strip the quoted "> Hey, how are you?"
    assert "Hey, how are you?" not in reply["content"]
```

**Step 3: Run test — expect FAIL**

**Step 4: Implement** `backend/app/parsers/email_parser.py`:

```python
import mailbox
import email.utils
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from email_reply_parser import EmailReplyParser


def _extract_body(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode("utf-8", errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            return payload.decode("utf-8", errors="replace")
    return ""


def _parse_date(msg) -> str:
    date_str = msg.get("Date", "")
    try:
        parsed = email.utils.parsedate_to_datetime(date_str)
        return parsed.isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def _get_sender_name(msg) -> str:
    from_header = msg.get("From", "")
    name, addr = email.utils.parseaddr(from_header)
    return name or addr


def parse_mbox(file_path: Path) -> list[dict]:
    mbox = mailbox.mbox(str(file_path))

    # Group by thread (using In-Reply-To / References)
    threads: dict[str, list] = defaultdict(list)

    for msg in mbox:
        msg_id = msg.get("Message-ID", "")
        in_reply_to = msg.get("In-Reply-To", "")
        subject = msg.get("Subject", "")

        # Determine thread key
        thread_key = in_reply_to or msg_id or subject

        body = _extract_body(msg)
        if body:
            # Use email-reply-parser to strip quoted text
            reply = EmailReplyParser.parse_reply(body)
            reply = reply.strip()

            if reply:
                threads[thread_key].append({
                    "sender": _get_sender_name(msg),
                    "timestamp": _parse_date(msg),
                    "content": reply,
                    "type": "text",
                })

    results = []
    for thread_key, messages in threads.items():
        if not messages:
            continue
        participants = sorted({m["sender"] for m in messages})
        messages.sort(key=lambda m: m["timestamp"])
        results.append({
            "source": "email",
            "conversation_id": uuid4().hex[:12],
            "participants": participants,
            "messages": messages,
        })

    return results
```

**Step 5: Run tests — expect PASS**

**Step 6: Commit**

```bash
git add -A
git commit -m "add email parser with reply stripping"
```

---

### Task 9: Import API endpoints + file upload

**Files:**
- Create: `backend/app/routers/imports.py`
- Modify: `backend/app/main.py` (register router)
- Create: `backend/tests/test_import_api.py`

**Step 1: Write failing test**:

```python
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
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement** `backend/app/routers/imports.py`:

```python
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.config import settings
from app.parsers.whatsapp import parse_whatsapp
from app.parsers.instagram import parse_instagram
from app.parsers.discord import parse_discord_channel
from app.parsers.email_parser import parse_mbox

router = APIRouter(prefix="/api/import", tags=["import"])

PARSERS = {
    "whatsapp": parse_whatsapp,
    "instagram": parse_instagram,
    "email": parse_mbox,
}


@router.post("")
async def upload_chat(
    file: UploadFile = File(...),
    source: str = Form(...),
):
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
        if source in PARSERS:
            result = PARSERS[source](save_path)
            if isinstance(result, list):
                # email/imessage return lists
                total_messages = sum(len(r["messages"]) for r in result)
            else:
                total_messages = len(result["messages"])
        else:
            raise HTTPException(400, f"Parser for {source} not yet integrated via upload")
    except Exception as e:
        raise HTTPException(422, f"Failed to parse: {str(e)}")

    # Save parsed result
    import json
    parsed_path = settings.parsed_dir / f"{import_id}.json"
    parsed_data = result if not isinstance(result, list) else result
    parsed_path.write_text(json.dumps(parsed_data, indent=2, default=str))

    return {
        "import_id": import_id,
        "source": source,
        "file_name": file.filename,
        "message_count": total_messages,
        "status": "parsed",
    }
```

**Step 4: Register router in `backend/app/main.py`**:

```python
from app.routers.imports import router as import_router
app.include_router(import_router)
```

**Step 5: Run tests — expect PASS**

**Step 6: Commit**

```bash
git add -A
git commit -m "add import api with file upload"
```

---

## Phase 3: Hardware Detection & Training Pipeline

### Task 10: Hardware detection service

**Files:**
- Create: `backend/app/services/hardware.py`
- Create: `backend/tests/test_hardware.py`
- Create: `backend/app/routers/system.py`

**Step 1: Implement** `backend/app/services/hardware.py`:

```python
import platform
import subprocess
import shutil
import psutil


def detect_hardware() -> dict:
    info = {
        "gpu_type": "cpu",
        "gpu_name": None,
        "vram_gb": None,
        "ram_gb": round(psutil.virtual_memory().total / (1024**3), 1),
        "cuda_version": None,
        "rocm_version": None,
        "os": platform.system(),
        "arch": platform.machine(),
    }

    # Check NVIDIA
    if shutil.which("nvidia-smi"):
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                parts = result.stdout.strip().split(",")
                info["gpu_type"] = "nvidia"
                info["gpu_name"] = parts[0].strip()
                info["vram_gb"] = round(float(parts[1].strip()) / 1024, 1)

                cuda_result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
                    capture_output=True, text=True, timeout=10,
                )
                if cuda_result.returncode == 0:
                    info["cuda_version"] = cuda_result.stdout.strip()
        except Exception:
            pass

    # Check Apple Silicon
    elif platform.system() == "Darwin" and platform.machine() == "arm64":
        info["gpu_type"] = "apple_silicon"
        info["gpu_name"] = "Apple Silicon (MPS)"
        # Apple Silicon shares unified memory
        info["vram_gb"] = info["ram_gb"]

    # Check AMD ROCm
    elif shutil.which("rocm-smi"):
        try:
            result = subprocess.run(
                ["rocm-smi", "--showproductname"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                info["gpu_type"] = "amd"
                info["gpu_name"] = result.stdout.strip().split("\n")[-1].strip()
                # Try to get VRAM
                vram_result = subprocess.run(
                    ["rocm-smi", "--showmeminfo", "vram", "--csv"],
                    capture_output=True, text=True, timeout=10,
                )
                if vram_result.returncode == 0:
                    for line in vram_result.stdout.strip().split("\n"):
                        if "Total" in line or line.replace(",", "").strip().isdigit():
                            try:
                                vram_bytes = int(line.replace(",", "").strip())
                                info["vram_gb"] = round(vram_bytes / (1024**3), 1)
                            except ValueError:
                                pass
        except Exception:
            pass

    return info
```

**Step 2: Create router** `backend/app/routers/system.py`:

```python
from fastapi import APIRouter
from app.services.hardware import detect_hardware

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/hardware")
async def get_hardware():
    return detect_hardware()
```

**Step 3: Register in main.py, test manually**

```bash
curl http://localhost:8420/api/system/hardware
```

**Step 4: Commit**

```bash
git add -A
git commit -m "add hardware detection service"
```

---

### Task 11: Training data formatter

**Files:**
- Create: `backend/app/services/data_formatter.py`
- Create: `backend/tests/test_data_formatter.py`

**Step 1: Write failing test**:

```python
import pytest
from app.services.data_formatter import format_for_style, format_for_insights


SAMPLE_CONVO = {
    "source": "whatsapp",
    "conversation_id": "abc",
    "participants": ["John", "me"],
    "messages": [
        {"sender": "John", "timestamp": "2024-01-01T10:00:00", "content": "Hey", "type": "text"},
        {"sender": "me", "timestamp": "2024-01-01T10:01:00", "content": "Hi!", "type": "text"},
        {"sender": "John", "timestamp": "2024-01-01T10:02:00", "content": "How are you?", "type": "text"},
        {"sender": "me", "timestamp": "2024-01-01T10:03:00", "content": "Good, you?", "type": "text"},
    ],
}


def test_format_for_style_creates_pairs():
    pairs = format_for_style([SAMPLE_CONVO], self_name="me")
    assert len(pairs) == 2
    assert pairs[0]["instruction"] == "Hey"
    assert pairs[0]["output"] == "Hi!"
    assert pairs[1]["instruction"] == "How are you?"
    assert pairs[1]["output"] == "Good, you?"


def test_format_for_insights_creates_chunks():
    chunks = format_for_insights([SAMPLE_CONVO], self_name="me")
    assert len(chunks) >= 1
    assert "Hey" in chunks[0]["conversation"]
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement** `backend/app/services/data_formatter.py`:

```python
def format_for_style(conversations: list[dict], self_name: str) -> list[dict]:
    """Convert conversations into instruction/output pairs for style finetuning.

    Each pair: other person says X (instruction) → you reply Y (output).
    """
    pairs = []

    for convo in conversations:
        messages = [m for m in convo["messages"] if m["type"] == "text"]

        for i, msg in enumerate(messages):
            if msg["sender"] == self_name:
                continue
            # Look for the next message from self_name as the reply
            for j in range(i + 1, len(messages)):
                if messages[j]["sender"] == self_name:
                    pairs.append({
                        "instruction": msg["content"],
                        "output": messages[j]["content"],
                    })
                    break

    return pairs


def format_for_insights(
    conversations: list[dict], self_name: str, chunk_size: int = 20
) -> list[dict]:
    """Convert conversations into chunks for insights/analysis finetuning.

    Returns conversation chunks with metadata.
    """
    chunks = []

    for convo in conversations:
        messages = [m for m in convo["messages"] if m["type"] == "text"]

        for i in range(0, len(messages), chunk_size):
            chunk_msgs = messages[i : i + chunk_size]
            if len(chunk_msgs) < 3:
                continue

            conversation_text = "\n".join(
                f"{m['sender']}: {m['content']}" for m in chunk_msgs
            )

            chunks.append({
                "conversation": conversation_text,
                "source": convo["source"],
                "participants": convo["participants"],
                "self_name": self_name,
            })

    return chunks
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add -A
git commit -m "add training data formatter"
```

---

### Task 12: Training worker subprocess

**Files:**
- Create: `backend/app/training/worker.py` — standalone script that runs as subprocess
- Create: `backend/app/training/manager.py` — spawns and monitors worker
- Create: `backend/app/routers/training.py`

**Step 1: Implement** `backend/app/training/worker.py` (the subprocess entry point):

```python
"""Training worker — runs as a subprocess.

Reads config from stdin (JSON), writes progress to stdout (JSON lines).
"""
import json
import sys
from pathlib import Path


def log(data: dict):
    print(json.dumps(data), flush=True)


def train(config: dict):
    log({"event": "start", "message": "Loading model and tokenizer..."})

    try:
        import torch
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            TrainingArguments,
            Trainer,
            DataCollatorForLanguageModeling,
        )
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from datasets import Dataset

        # Determine device
        if torch.cuda.is_available():
            device_type = "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device_type = "mps"
        else:
            device_type = "cpu"

        log({"event": "device", "device": device_type})

        # Load quantization config
        quant = config.get("quantization", "4bit")
        bnb_config = None
        if quant == "4bit" and device_type == "cuda":
            from transformers import BitsAndBytesConfig
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
            )
        elif quant == "8bit" and device_type == "cuda":
            from transformers import BitsAndBytesConfig
            bnb_config = BitsAndBytesConfig(load_in_8bit=True)

        log({"event": "progress", "message": "Loading base model...", "percent": 5})

        model = AutoModelForCausalLM.from_pretrained(
            config["base_model"],
            quantization_config=bnb_config,
            device_map="auto" if device_type == "cuda" else None,
            torch_dtype=torch.float16 if device_type != "cpu" else torch.float32,
            cache_dir=config.get("cache_dir"),
        )
        tokenizer = AutoTokenizer.from_pretrained(
            config["base_model"],
            cache_dir=config.get("cache_dir"),
        )
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        log({"event": "progress", "message": "Preparing LoRA...", "percent": 15})

        if quant in ("4bit", "8bit") and device_type == "cuda":
            model = prepare_model_for_kbit_training(model)

        lora_alpha = config.get("lora_alpha") or (2 * config["lora_rank"])
        lora_config = LoraConfig(
            r=config["lora_rank"],
            lora_alpha=lora_alpha,
            lora_dropout=config.get("lora_dropout", 0.05),
            target_modules=config.get("target_modules", [
                "q_proj", "k_proj", "v_proj", "o_proj",
                "gate_proj", "up_proj", "down_proj",
            ]),
            bias="none",
            task_type="CAUSAL_LM",
        )
        model = get_peft_model(model, lora_config)

        log({"event": "progress", "message": "Preparing dataset...", "percent": 20})

        # Load training data
        data_path = Path(config["data_path"])
        raw_data = json.loads(data_path.read_text())

        # Format based on mode
        if config["mode"] == "style":
            texts = [
                f"<|user|>\n{item['instruction']}\n<|assistant|>\n{item['output']}"
                for item in raw_data
            ]
        else:
            texts = [
                f"<|user|>\nAnalyze this conversation:\n{item['conversation']}\n<|assistant|>\n"
                for item in raw_data
            ]

        def tokenize(examples):
            return tokenizer(
                examples["text"],
                truncation=True,
                max_length=config.get("max_seq_length", 2048),
                padding="max_length",
            )

        dataset = Dataset.from_dict({"text": texts})
        tokenized = dataset.map(tokenize, batched=True, remove_columns=["text"])

        # Split
        split_ratio = config.get("dataset_split", 0.1)
        if split_ratio > 0 and len(tokenized) > 10:
            split = tokenized.train_test_split(test_size=split_ratio, seed=config.get("shuffle_seed", 42))
            train_dataset = split["train"]
            eval_dataset = split["test"]
        else:
            train_dataset = tokenized
            eval_dataset = None

        log({"event": "progress", "message": f"Training on {len(train_dataset)} examples...", "percent": 25})

        output_dir = config["output_dir"]
        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=config.get("num_epochs", 3),
            max_steps=config.get("max_steps", -1),
            per_device_train_batch_size=config.get("batch_size", 4),
            gradient_accumulation_steps=config.get("gradient_accumulation_steps", 4),
            learning_rate=config.get("learning_rate", 2e-4),
            lr_scheduler_type=config.get("lr_scheduler", "cosine"),
            weight_decay=config.get("weight_decay", 0.01),
            warmup_ratio=config.get("warmup_ratio", 0.03),
            max_grad_norm=config.get("max_grad_norm", 0.3),
            logging_steps=config.get("logging_steps", 10),
            save_steps=config.get("save_steps", 100),
            save_total_limit=config.get("max_checkpoints", 3),
            eval_strategy="steps" if eval_dataset else "no",
            eval_steps=config.get("eval_steps", 100) if eval_dataset else None,
            fp16=(device_type == "cuda"),
            report_to="none",
            seed=config.get("shuffle_seed", 42),
        )

        class ProgressCallback:
            def on_log(self, args, state, control, logs=None, **kwargs):
                if logs:
                    log({
                        "event": "metrics",
                        "step": state.global_step,
                        "total_steps": state.max_steps,
                        "percent": min(95, 25 + int(70 * state.global_step / max(state.max_steps, 1))),
                        **{k: v for k, v in logs.items() if isinstance(v, (int, float))},
                    })

        from transformers import TrainerCallback

        class ProgressTrainerCallback(TrainerCallback):
            def on_log(self, args, state, control, logs=None, **kwargs):
                if logs:
                    log({
                        "event": "metrics",
                        "step": state.global_step,
                        "total_steps": state.max_steps,
                        "percent": min(95, 25 + int(70 * state.global_step / max(state.max_steps, 1))),
                        **{k: v for k, v in logs.items() if isinstance(v, (int, float))},
                    })

        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
            callbacks=[ProgressTrainerCallback()],
        )

        trainer.train()

        log({"event": "progress", "message": "Saving adapter...", "percent": 96})
        model.save_pretrained(output_dir)
        tokenizer.save_pretrained(output_dir)

        log({"event": "complete", "message": "Training complete!", "percent": 100, "output_dir": output_dir})

    except Exception as e:
        log({"event": "error", "message": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    config = json.loads(sys.stdin.read())
    train(config)
```

**Step 2: Implement** `backend/app/training/manager.py`:

```python
import asyncio
import json
import subprocess
import sys
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone

from app.config import settings

# Active training processes
_active_jobs: dict[str, subprocess.Popen] = {}
_job_subscribers: dict[str, list[asyncio.Queue]] = {}


def subscribe(run_id: str) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    _job_subscribers.setdefault(run_id, []).append(queue)
    return queue


def unsubscribe(run_id: str, queue: asyncio.Queue):
    if run_id in _job_subscribers:
        _job_subscribers[run_id] = [q for q in _job_subscribers[run_id] if q is not queue]


async def start_training(config: dict) -> str:
    run_id = uuid4().hex[:12]
    output_dir = str(settings.adapters_dir / run_id)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    config["output_dir"] = output_dir
    config["cache_dir"] = str(settings.base_models_dir)

    worker_path = Path(__file__).parent / "worker.py"

    process = subprocess.Popen(
        [sys.executable, str(worker_path)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    process.stdin.write(json.dumps(config))
    process.stdin.close()

    _active_jobs[run_id] = process

    # Start monitoring in background
    asyncio.create_task(_monitor_job(run_id, process))

    return run_id


async def _monitor_job(run_id: str, process: subprocess.Popen):
    try:
        loop = asyncio.get_event_loop()
        while True:
            line = await loop.run_in_executor(None, process.stdout.readline)
            if not line:
                break
            try:
                data = json.loads(line.strip())
                data["run_id"] = run_id
                for queue in _job_subscribers.get(run_id, []):
                    await queue.put(data)
            except json.JSONDecodeError:
                continue

        process.wait()
        final = {
            "run_id": run_id,
            "event": "finished",
            "return_code": process.returncode,
        }
        for queue in _job_subscribers.get(run_id, []):
            await queue.put(final)

    finally:
        _active_jobs.pop(run_id, None)


def cancel_training(run_id: str) -> bool:
    process = _active_jobs.get(run_id)
    if process:
        process.terminate()
        _active_jobs.pop(run_id, None)
        return True
    return False
```

**Step 3: Create router** `backend/app/routers/training.py`:

```python
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.training.manager import start_training, subscribe, unsubscribe, cancel_training
from app.models.schemas import TrainingConfig

router = APIRouter(tags=["training"])


@router.post("/api/train")
async def begin_training(config: TrainingConfig):
    run_id = await start_training(config.model_dump())
    return {"run_id": run_id, "status": "started"}


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
```

**Step 4: Register router in main.py**

**Step 5: Commit**

```bash
git add -A
git commit -m "add training worker and manager"
```

---

### Task 13: Model merge and GGUF conversion

**Files:**
- Create: `backend/app/training/converter.py`

**Step 1: Implement** `backend/app/training/converter.py`:

```python
"""Merge LoRA adapter with base model and convert to GGUF."""
import json
import subprocess
import sys
from pathlib import Path


def log(data: dict):
    print(json.dumps(data), flush=True)


def merge_and_convert(
    adapter_path: str,
    base_model: str,
    output_path: str,
    gguf_quantization: str = "Q4_K_M",
    merge: bool = True,
    cache_dir: str | None = None,
):
    """Merge LoRA adapter with base, then convert to GGUF.

    This runs as part of the training worker post-processing.
    """
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
    import torch

    log({"event": "progress", "message": "Loading base model for merge...", "percent": 96})

    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=torch.float16,
        device_map="cpu",
        cache_dir=cache_dir,
    )
    tokenizer = AutoTokenizer.from_pretrained(base_model, cache_dir=cache_dir)

    if merge:
        log({"event": "progress", "message": "Merging LoRA adapter...", "percent": 97})
        model = PeftModel.from_pretrained(model, adapter_path)
        model = model.merge_and_unload()

    merged_path = Path(output_path) / "merged"
    merged_path.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(merged_path)
    tokenizer.save_pretrained(merged_path)

    log({"event": "progress", "message": f"Converting to GGUF ({gguf_quantization})...", "percent": 98})

    # Use llama.cpp's convert script
    # The user needs llama.cpp installed — install script handles this
    gguf_output = Path(output_path) / f"model-{gguf_quantization}.gguf"

    # First convert to f16 GGUF
    f16_path = Path(output_path) / "model-f16.gguf"
    subprocess.run(
        [
            sys.executable, "-m", "llama_cpp.convert",
            str(merged_path),
            "--outfile", str(f16_path),
            "--outtype", "f16",
        ],
        check=True,
    )

    # Then quantize if needed
    if gguf_quantization != "F16":
        subprocess.run(
            [
                "llama-quantize",
                str(f16_path),
                str(gguf_output),
                gguf_quantization,
            ],
            check=True,
        )
        f16_path.unlink(missing_ok=True)
    else:
        gguf_output = f16_path

    log({"event": "progress", "message": "GGUF conversion complete!", "percent": 99})
    return str(gguf_output)
```

**Step 2: Commit**

```bash
git add -A
git commit -m "add model merge and gguf converter"
```

---

## Phase 4: Inference Engine

### Task 14: llama.cpp inference service

**Files:**
- Create: `backend/app/inference/engine.py`
- Create: `backend/app/routers/chat.py`
- Create: `backend/app/routers/openai_compat.py`

**Step 1: Implement** `backend/app/inference/engine.py`:

```python
from pathlib import Path
from threading import Lock
from typing import Iterator

from llama_cpp import Llama

_models: dict[str, Llama] = {}
_lock = Lock()


def load_model(model_id: str, gguf_path: str, n_ctx: int = 4096, n_gpu_layers: int = -1) -> None:
    with _lock:
        if model_id in _models:
            unload_model(model_id)
        _models[model_id] = Llama(
            model_path=gguf_path,
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers,
            verbose=False,
        )


def unload_model(model_id: str) -> None:
    with _lock:
        model = _models.pop(model_id, None)
        if model:
            del model


def get_loaded_models() -> list[str]:
    return list(_models.keys())


def generate(
    model_id: str,
    messages: list[dict],
    max_tokens: int = 512,
    temperature: float = 0.7,
    stream: bool = False,
) -> dict | Iterator[dict]:
    model = _models.get(model_id)
    if not model:
        raise ValueError(f"Model {model_id} is not loaded")

    result = model.create_chat_completion(
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        stream=stream,
    )

    return result
```

**Step 2: Implement** `backend/app/routers/openai_compat.py`:

```python
import json
import time
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.inference.engine import generate, get_loaded_models

router = APIRouter(tags=["openai"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    max_tokens: int = 512
    temperature: float = 0.7
    stream: bool = False


@router.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    try:
        if request.stream:
            return StreamingResponse(
                _stream_response(request),
                media_type="text/event-stream",
            )

        result = generate(
            model_id=request.model,
            messages=[m.model_dump() for m in request.messages],
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            stream=False,
        )
        return result

    except ValueError as e:
        raise HTTPException(404, str(e))


async def _stream_response(request: ChatCompletionRequest):
    stream = generate(
        model_id=request.model,
        messages=[m.model_dump() for m in request.messages],
        max_tokens=request.max_tokens,
        temperature=request.temperature,
        stream=True,
    )
    for chunk in stream:
        yield f"data: {json.dumps(chunk)}\n\n"
    yield "data: [DONE]\n\n"


@router.get("/v1/models")
async def list_models():
    models = get_loaded_models()
    return {
        "object": "list",
        "data": [
            {"id": m, "object": "model", "owned_by": "selfai"}
            for m in models
        ],
    }
```

**Step 3: Implement** `backend/app/routers/chat.py` (WebSocket streaming for frontend):

```python
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.inference.engine import generate

router = APIRouter(tags=["chat"])


@router.websocket("/ws/chat")
async def chat_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            model_id = data.get("model_id")
            messages = data.get("messages", [])

            try:
                stream = generate(
                    model_id=model_id,
                    messages=messages,
                    max_tokens=data.get("max_tokens", 512),
                    temperature=data.get("temperature", 0.7),
                    stream=True,
                )

                for chunk in stream:
                    choices = chunk.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            await websocket.send_json({
                                "type": "token",
                                "content": content,
                            })

                await websocket.send_json({"type": "done"})

            except ValueError as e:
                await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        pass
```

**Step 4: Register all routers in main.py**

**Step 5: Commit**

```bash
git add -A
git commit -m "add inference engine and openai-compat api"
```

---

## Phase 5: Frontend UI

### Task 15: Build the base state (chat-first landing page)

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx`
- Create: `frontend/src/components/ChatInput.tsx`
- Create: `frontend/src/components/SuggestionChips.tsx`
- Create: `frontend/src/components/AiDisclaimer.tsx`

This is a design-heavy task. Build the AetherAI-inspired centered layout:
- Self.ai logo centered
- "Good to See You!" greeting
- Chat input bar with `[+]` and voice icon
- Suggestion chips below
- AI disclaimer at bottom
- Dark theme (zinc-950 background)

Refer to the design doc section "Base State — Chat-First Landing" and the AetherAI screenshot for visual reference.

**Commit:**

```bash
git add -A
git commit -m "build chat-first landing page"
```

---

### Task 16: Build the expanded state (three-column layout)

**Files:**
- Create: `frontend/src/layouts/AppLayout.tsx` (three-column: sidebar + list + content)
- Create: `frontend/src/components/Sidebar.tsx` (icon rail)
- Create: `frontend/src/components/ListPanel.tsx` (middle panel)
- Modify: `frontend/src/layouts/RootLayout.tsx` (state transitions)

Build the ReadPo-inspired layout:
- Left: icon rail sidebar (Chat, Import, Train, Models, Settings)
- Middle: context-sensitive list panel
- Right: main content area
- Smooth transition from base state to expanded state

Refer to the design doc and the ReadPo screenshot.

**Commit:**

```bash
git add -A
git commit -m "build three-column expanded layout"
```

---

### Task 17: Import page

**Files:**
- Create: `frontend/src/pages/ImportPage.tsx`
- Create: `frontend/src/components/FileDropZone.tsx`
- Create: `frontend/src/components/ImportProgress.tsx`
- Create: `frontend/src/api/imports.ts` (TanStack Query hooks)

Features:
- Drag-and-drop file upload zone per source type (WhatsApp, Instagram, iMessage, Discord, Email)
- Source type selector with icons
- Upload progress bar
- After upload: show parsed message count, participant list, preview of first few messages
- Identity resolution: dropdown to select "which name is you?"
- List of previous imports in the middle panel

**Commit:**

```bash
git add -A
git commit -m "build import page with file upload"
```

---

### Task 18: Training page

**Files:**
- Create: `frontend/src/pages/TrainPage.tsx`
- Create: `frontend/src/components/ModelPicker.tsx`
- Create: `frontend/src/components/PresetSelector.tsx`
- Create: `frontend/src/components/AdvancedSettings.tsx`
- Create: `frontend/src/components/TrainingDashboard.tsx`
- Create: `frontend/src/api/training.ts` (TanStack Query + WebSocket hooks)

Features:
- Model picker with VRAM requirements + compatibility warnings
- Preset selector (Quick/Balanced/Max Quality/Custom)
- Collapsible advanced settings panel with ALL settings from design doc
- Start/Stop training button
- Real-time loss curve chart (via WebSocket)
- Progress bar with step count and ETA
- Training run history in middle panel

**Commit:**

```bash
git add -A
git commit -m "build training page with settings ui"
```

---

### Task 19: Chat page

**Files:**
- Create: `frontend/src/pages/ChatPage.tsx`
- Create: `frontend/src/components/ChatBubble.tsx`
- Create: `frontend/src/components/ChatStream.tsx`
- Create: `frontend/src/api/chat.ts` (WebSocket hook for streaming)

Features:
- Chat interface with message bubbles
- WebSocket streaming (token by token)
- Two modes: Style chat / Insights chat
- Model selector dropdown
- Chat session history in middle panel
- AI disclaimer banner
- Suggestion chips for insights mode ("What topics do I discuss most?", etc.)

**Commit:**

```bash
git add -A
git commit -m "build chat page with streaming"
```

---

### Task 20: Models page

**Files:**
- Create: `frontend/src/pages/ModelsPage.tsx`
- Create: `frontend/src/components/ModelCard.tsx`
- Create: `frontend/src/api/models.ts`

Features:
- List of trained models with metadata (base model, training date, mode, size)
- Load/unload toggle per model
- Export GGUF download button
- Delete model button with confirmation
- Training run details (settings used, loss chart)

**Commit:**

```bash
git add -A
git commit -m "build models page"
```

---

### Task 21: Settings page

**Files:**
- Create: `frontend/src/pages/SettingsPage.tsx`

Features:
- API endpoint display (localhost:8420)
- Data management: view storage usage, delete all data button with confirmation
- Theme toggle (dark/light — default dark)
- Default model selection

**Commit:**

```bash
git add -A
git commit -m "build settings page"
```

---

## Phase 6: Install Scripts & Polish

### Task 22: Install script (macOS/Linux)

**Files:**
- Create: `scripts/install.sh`

The script must:
1. Detect OS + arch
2. Detect GPU
3. Install Python 3.10+ if missing (suggest pyenv)
4. Install Node 18+ if missing (suggest nvm)
5. Clone repo (or check if already in repo dir)
6. Create venv, install Python deps (with correct torch variant for GPU)
7. Install frontend deps, build
8. Create `~/.selfai/` dirs
9. Create `selfai` launcher script in `~/.local/bin/`
10. Print success + next steps

**Commit:**

```bash
git add scripts/install.sh
git commit -m "add install script for macos and linux"
```

---

### Task 23: Install script (Windows)

**Files:**
- Create: `scripts/install.ps1`

Same logic as Task 22 but for PowerShell/Windows:
- Check for Python, Node, Git via `winget` or `scoop`
- Create venv, install deps
- Create `selfai.bat` launcher
- Handle CUDA detection via `nvidia-smi`

**Commit:**

```bash
git add scripts/install.ps1
git commit -m "add install script for windows"
```

---

### Task 24: Launcher script

**Files:**
- Create: `scripts/selfai.sh`
- Create: `scripts/selfai.bat`

```bash
#!/usr/bin/env bash
# selfai launcher

SELFAI_DIR="$(dirname "$(readlink -f "$0")")/.."
cd "$SELFAI_DIR"

case "${1:-start}" in
  start)
    source backend/.venv/bin/activate
    uvicorn app.main:app --host 127.0.0.1 --port 8420 &
    sleep 2
    python -c "import webbrowser; webbrowser.open('http://localhost:8420')"
    echo "Self.ai running at http://localhost:8420"
    wait
    ;;
  stop)
    pkill -f "uvicorn app.main:app.*8420" || echo "Not running"
    ;;
  *)
    echo "Usage: selfai [start|stop]"
    ;;
esac
```

**Commit:**

```bash
git add scripts/selfai.sh scripts/selfai.bat
git commit -m "add launcher scripts"
```

---

### Task 25: FastAPI serves built frontend

**Files:**
- Modify: `backend/app/main.py`

After `npm run build`, the frontend is at `frontend/dist/`. Mount it as static files in FastAPI:

```python
from pathlib import Path

frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
```

This must be the LAST mount (after all API routes) so API routes take priority.

**Commit:**

```bash
git add -A
git commit -m "serve built frontend from fastapi"
```

---

### Task 26: Models API (CRUD + load/export)

**Files:**
- Create: `backend/app/routers/models.py`

Endpoints:
- `GET /api/models` — list all trained models from DB
- `POST /api/models/{id}/load` — load GGUF into llama.cpp
- `POST /api/models/{id}/unload` — unload from memory
- `DELETE /api/models/{id}` — delete model files + DB record
- `GET /api/models/{id}/export` — serve GGUF file as download

**Commit:**

```bash
git add -A
git commit -m "add models crud api"
```

---

### Task 27: Data stats and management API

**Files:**
- Create: `backend/app/routers/data.py`

Endpoints:
- `GET /api/data/stats` — total conversations, messages, storage used, per-source breakdown
- `DELETE /api/data` — wipe all data (imports, parsed, training data, DB records)
- `GET /api/data/conversations` — list all imported conversations with metadata

**Commit:**

```bash
git add -A
git commit -m "add data management api"
```

---

### Task 28: End-to-end integration test

**Files:**
- Create: `backend/tests/test_e2e.py`

Test the full flow:
1. Upload a WhatsApp chat file via `/api/import`
2. Check it appears in `/api/data/stats`
3. Start a training run via `/api/train` (mock the actual ML training)
4. Verify the model appears in `/api/models`

**Commit:**

```bash
git add -A
git commit -m "add e2e integration test"
```

---

## Summary

**28 tasks across 6 phases:**

| Phase | Tasks | What You Get |
|-------|-------|-------------|
| 1. Scaffolding | 1-3 | Working FastAPI + React app with routing |
| 2. Parsers | 4-9 | All 5 chat parsers + upload API |
| 3. Training | 10-13 | Hardware detection, data formatting, training pipeline, GGUF conversion |
| 4. Inference | 14 | llama.cpp inference + OpenAI-compatible API |
| 5. Frontend | 15-21 | Full UI (landing, import, train, chat, models, settings) |
| 6. Polish | 22-28 | Install scripts, launcher, static serving, remaining APIs, e2e test |

Each phase produces a working increment that can be tested independently.
