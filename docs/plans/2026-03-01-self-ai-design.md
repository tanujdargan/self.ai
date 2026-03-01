# Self.ai — Design Document

**Date:** 2026-03-01
**Status:** Approved

## Overview

Self.ai is a fully local platform that lets you finetune open-source LLMs on your personal chat history. It learns your communication style and surfaces deep insights about your patterns — all without your data ever leaving your machine.

## Goals

1. **Style Model** — Finetune a model that talks like you (tone, vocabulary, emoji usage, phrasing)
2. **Insights Model** — Finetune a model that can analyze your conversation patterns, topics, relationships, and behavior over time
3. **Fully local** — All data processing, training, and inference happens on the user's machine
4. **Cross-platform** — Works on Windows, macOS (Intel + Apple Silicon), and Linux
5. **One-command install** — `curl | bash` or `irm | iex` sets up everything
6. **Hardware flexible** — NVIDIA (CUDA), Apple Silicon (MPS), AMD (ROCm), or CPU fallback

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                       Self.ai                            │
│                                                          │
│  ┌──────────────┐     ┌──────────────────────────────┐  │
│  │   Frontend    │     │       Backend (FastAPI)       │  │
│  │  Vite+React   │────▶│                              │  │
│  │  TanStack     │◀────│  REST API ─── WebSocket      │  │
│  │  Router/Query │     │     │              │         │  │
│  └──────────────┘     │     ▼              ▼         │  │
│                        │  ┌──────┐   ┌───────────┐   │  │
│                        │  │Parser│   │ Training   │   │  │
│                        │  │Engine│   │ Worker     │   │  │
│                        │  └──┬───┘   │(subprocess)│   │  │
│                        │     │       └─────┬─────┘   │  │
│                        │     ▼             │         │  │
│                        │  ┌──────────────┐ │         │  │
│                        │  │  Data Store   │◀┘         │  │
│                        │  │  (SQLite)     │           │  │
│                        │  └──────────────┘           │  │
│                        │     │                       │  │
│                        │     ▼                       │  │
│                        │  ┌──────────────┐           │  │
│                        │  │ llama.cpp     │           │  │
│                        │  │ (inference)   │           │  │
│                        │  └──────────────┘           │  │
│                        └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Monorepo structure** with single FastAPI process serving the built frontend + REST/WebSocket API. Training runs as a background subprocess spawned by FastAPI, reporting progress via IPC → WebSocket.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React + TanStack Router + TanStack Query |
| Backend | Python FastAPI |
| Database | SQLite (via aiosqlite) |
| Training | HuggingFace Transformers + PEFT (QLoRA) |
| Inference | llama.cpp via llama-cpp-python |
| IPC | WebSocket (training progress, chat streaming) |

## Chat Import & Data Pipeline

### Supported Sources

All parsers are custom-built (simple formats) except email:

| Source | Format | Parser Strategy |
|--------|--------|-----------------|
| WhatsApp | `.txt` export | Regex-based line parser (~100 lines). Handles multiline, timestamps, media placeholders. |
| Instagram | `.json` data download | JSON parser. Messages at `messages/inbox/<user>/message_1.json`. Known stable schema. |
| iMessage | `chat.db` (SQLite) | SQLite queries against `message` + `handle` + `chat` tables. macOS only — shows warning on other OS. |
| Discord | `.json` GDPR export | JSON parser. Channel-based grouping. |
| Email | `.mbox` / `.eml` | Python stdlib `mailbox` + `email-reply-parser` (519 stars, by Zapier) for thread cleaning. |

### Unified Schema

All parsers output:

```json
{
  "source": "whatsapp",
  "conversation_id": "abc123",
  "participants": ["you", "John"],
  "messages": [
    {
      "sender": "you",
      "timestamp": "2024-01-15T14:30:00Z",
      "content": "hey what's up",
      "type": "text"
    }
  ]
}
```

### Processing Pipeline

1. **Import** — Parse raw export into unified format
2. **Identity resolution** — User identifies "which name is me" across all imports
3. **Filtering** — Remove system messages, media-only messages, very short conversations
4. **Training format conversion:**
   - **Style model:** `[Other person's message] → [Your reply]` pairs
   - **Insights model:** Full conversation chunks for analysis/summarization

### Privacy

- All data stays local — never leaves the machine
- Stored in `~/.selfai/data/`
- User can delete all data from the UI

## Training Pipeline

### Two Training Modes

**Mode 1: Style Model** — Supervised finetuning. Given the other person's message, predict your reply.

**Mode 2: Insights Model** — Finetuned for summarization/analysis of conversations. Full conversation chunks as context with AI-generated analysis as target.

### Supported Base Models

| Model | Size | Min VRAM (QLoRA 4-bit) |
|-------|------|----------------------|
| Phi-3.5 Mini | 3.8B | ~4GB |
| Llama 3.1 8B | 8B | ~6GB |
| Gemma 2 9B | 9B | ~7GB |
| Mistral 7B v0.3 | 7B | ~6GB |
| Llama 3.1 70B | 70B | ~42GB |
| Qwen 2.5 72B | 72B | ~44GB |

### Training Method

QLoRA: 4-bit quantized base model + LoRA adapter training. Output: LoRA adapter → merge with base → convert to GGUF for llama.cpp inference.

### Settings UI: Expert Mode with Presets

**Presets:**

| Preset | Quantization | LoRA Rank | Epochs | Est. Time (8B, 10k msgs) |
|--------|-------------|-----------|--------|--------------------------|
| Quick Train | 4-bit | 8 | 1 | ~15 min |
| Balanced | 4-bit | 16 | 3 | ~45 min |
| Max Quality | 8-bit | 32 | 5 | ~2+ hours |

**Advanced Settings:**

Core Training:
- Quantization: 4-bit / 8-bit / none
- LoRA rank (r): 4, 8, 16, 32, 64, 128
- LoRA alpha: auto / manual
- LoRA dropout: 0.0 - 0.5
- Learning rate + scheduler (cosine, linear, constant, cosine with restarts, polynomial)
- Epochs / max steps
- Batch size per device
- Gradient accumulation steps
- Effective batch size display

Sequence & Data:
- Max sequence length: 256 - 8192
- Packing: on/off
- Dataset split ratio (train/eval)
- Shuffle seed

Regularization:
- Weight decay
- Warmup ratio / warmup steps
- Max gradient norm (gradient clipping)

Checkpointing & Logging:
- Save checkpoint every N steps
- Max checkpoints to keep
- Logging / eval frequency
- Early stopping: on/off + patience

LoRA Targets:
- Module selection: q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj
- Select all toggle

Output:
- GGUF quantization level: Q4_K_M, Q5_K_M, Q6_K, Q8_0, F16
- Merge LoRA before converting: yes/no
- Keep adapter separate: yes/no

### Hardware Detection

Auto-detects on startup:
- NVIDIA GPU → CUDA + bitsandbytes
- Apple Silicon → MPS backend (CPU fallback for unsupported ops)
- AMD GPU → ROCm
- Fallback → CPU (with warning)

Displays detected hardware + estimated VRAM/RAM usage per model+settings combo.

## Frontend UI

### Design Pattern: Chat-First with Progressive Disclosure

Inspired by AetherAI (base state) and ReadPo (expanded state).

### Base State — Chat-First Landing

Clean dark theme, centered layout:
- Self.ai logo + greeting
- Centered chat input field
- Quick suggestion chips ("How do I usually talk?", "Patterns in my chats", "Insights about me")
- Minimal — sidebar hidden by default (hamburger top-left, settings top-right)
- AI disclaimer at bottom

### Expanded State — Three-Column Layout

When sidebar opened or navigating to Import/Train/Models:

**Left sidebar (icon rail):**
- Chat (default)
- Import
- Train
- Models
- Settings
- Profile/data

**Middle panel (context-sensitive list):**
- Chat: conversation history list
- Import: imported sources with message counts
- Train: training runs with status
- Models: trained models with metadata

**Right panel (main content):**
- Chat: active chat interface
- Import: drag-drop upload + parsing progress
- Train: model picker, settings, live training dashboard
- Models: details, export, training logs

### Transitions
- App opens in base state (chat-focused)
- Sidebar hamburger or non-chat navigation → expanded state
- Smooth animation between states
- Sidebar collapsible to icon-only rail

## Installation & Distribution

### One-Command Install

macOS/Linux: `curl -sSL https://raw.githubusercontent.com/<repo>/main/install.sh | bash`
Windows: `irm https://raw.githubusercontent.com/<repo>/main/install.ps1 | iex`

### Install Script Steps

1. Detect OS + architecture
2. Detect GPU (NVIDIA/Apple Silicon/AMD/CPU)
3. Check/install: Python 3.10+, Node.js 18+, Git
4. Clone repo
5. Create Python venv, install backend deps
6. Install frontend deps, build frontend
7. Pre-download default model (Phi-3.5 Mini GGUF, ~2GB)
8. Create `~/.selfai/` directory structure
9. Create `selfai` launcher command
10. Start server + open browser

### Usage

```bash
selfai        # start server + open browser
selfai stop   # stop server
```

### Directory Structure

```
~/.selfai/
├── data/
│   ├── imports/       # raw uploaded files
│   ├── parsed/        # unified conversation JSONs
│   └── training/      # formatted training datasets
├── models/
│   ├── base/          # downloaded base models
│   ├── adapters/      # LoRA adapters
│   └── merged/        # merged GGUF models
├── db/
│   └── selfai.db      # SQLite database
├── logs/
└── config.json        # user settings
```

## Inference & API

### Chat Interface

- llama.cpp via `llama-cpp-python` serves finetuned GGUF models
- WebSocket streaming for token-by-token responses
- Two model slots: Style model + Insights model

### OpenAI-Compatible API

`POST http://localhost:8420/v1/chat/completions`

Standard OpenAI chat completions format — works with Cursor, Continue, Open WebUI, etc.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/chat/completions` | OpenAI-compatible inference |
| GET | `/v1/models` | List loaded models |
| POST | `/api/import` | Upload chat exports |
| GET | `/api/import/status` | Parsing progress |
| POST | `/api/train` | Start training job |
| GET | `/api/train/status` | Training progress |
| GET | `/api/models` | List all trained models |
| POST | `/api/models/{id}/load` | Load model for inference |
| DELETE | `/api/models/{id}` | Delete a model |
| GET | `/api/models/{id}/export` | Download GGUF file |
| GET | `/api/data/stats` | Conversation statistics |
| DELETE | `/api/data` | Wipe all data |
| WS | `/ws/train` | Live training metrics |
| WS | `/ws/chat` | Streaming chat |

## AI Disclaimer

All inference pages display: "This model's outputs are AI-generated approximations. They do not represent your actual views or personality with certainty."
