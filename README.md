# Self.ai

Fine-tune open-source LLMs locally on your personal chat history. Train models that write like you and discover insights from your conversations.

## What it does

- **Style training** — Fine-tune a model on your messaging style so it responds like you
- **Insights training** — Train a model to analyze patterns, topics, and trends in your conversations
- **Chat parsers** — Import from WhatsApp, Instagram, iMessage, Discord, and Email
- **Local inference** — Run your fine-tuned models locally via llama.cpp
- **OpenAI-compatible API** — Drop-in replacement at `localhost:8420/v1/chat/completions`

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python, FastAPI, SQLite |
| Training | HuggingFace Transformers, QLoRA, PEFT |
| Inference | llama.cpp (GGUF) |
| Frontend | React, TanStack Router/Query, Tailwind CSS |
| GPU Support | NVIDIA (CUDA), Apple Silicon (MPS), AMD (ROCm), CPU fallback |

## Quick Start

### One-command install

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/tanujdargan/self.ai/master/scripts/install.sh | bash
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/tanujdargan/self.ai/master/scripts/install.ps1 | iex"
```

### Manual setup

```bash
git clone https://github.com/tanujdargan/self.ai.git
cd self.ai

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
npm run build

# Run
cd ../backend
uvicorn app.main:app --host 127.0.0.1 --port 8420
```

Open **http://localhost:8420** in your browser.

### Using the launcher

```bash
./scripts/selfai.sh start   # Start the server + open browser
./scripts/selfai.sh stop    # Stop the server
```

## Supported Chat Sources

| Source | Format | Notes |
|--------|--------|-------|
| WhatsApp | `.txt` export | Handles multiline messages, media, system messages |
| Instagram | `.json` from data download | Fixes Instagram's latin-1 encoding |
| iMessage | `chat.db` | macOS only, reads SQLite directly |
| Discord | GDPR `.json` export | Channel-based parsing |
| Email | `.mbox` | Thread grouping, quoted-reply stripping |

## Training Presets

| Preset | Epochs | LoRA Rank | Learning Rate |
|--------|--------|-----------|---------------|
| Quick Start | 1 | 16 | 3e-4 |
| Balanced | 3 | 64 | 2e-4 |
| Max Quality | 5 | 128 | 1e-4 |
| Custom | — | — | — |

All settings are fully configurable in the advanced panel, including quantization, scheduler, gradient accumulation, early stopping, and GGUF export options.

## Supported Models

| Model | Params | VRAM Required |
|-------|--------|---------------|
| TinyLlama-1.1B | 1.1B | ~2 GB |
| Phi-3.5-mini-instruct | 3.8B | ~4 GB |
| Llama-3.2-3B | 3B | ~4 GB |
| Llama-3.1-8B | 8B | ~8 GB |
| Mistral-7B-v0.3 | 7B | ~8 GB |
| Llama-3.1-70B | 70B | ~40 GB |

## API

The server exposes an OpenAI-compatible API:

```bash
curl http://localhost:8420/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "your-model-id", "messages": [{"role": "user", "content": "Hello"}]}'
```

Other endpoints:
- `GET /api/health` — Health check
- `GET /api/system/hardware` — Detected GPU/RAM info
- `POST /api/import` — Upload chat exports
- `POST /api/train` — Start training
- `GET /api/models` — List trained models
- `GET /api/data/stats` — Data statistics

## Project Structure

```
self.ai/
├── backend/
│   ├── app/
│   │   ├── config.py          # Settings and paths
│   │   ├── main.py            # FastAPI app
│   │   ├── db/                # SQLite database
│   │   ├── parsers/           # Chat import parsers
│   │   ├── services/          # Hardware detection, data formatting
│   │   ├── training/          # QLoRA training pipeline
│   │   ├── inference/         # llama.cpp inference engine
│   │   └── routers/           # API endpoints
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/             # Route pages
│       ├── components/        # UI components
│       └── api/               # TanStack Query hooks
└── scripts/                   # Install and launcher scripts
```

## License

MIT
