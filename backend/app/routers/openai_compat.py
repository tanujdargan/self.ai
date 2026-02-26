import json
import time
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.inference.engine import generate, get_loaded_models

router = APIRouter(prefix="/v1", tags=["openai-compat"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    max_tokens: int = 512
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    stream: bool = False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/models")
async def list_models():
    models = get_loaded_models()
    return {
        "object": "list",
        "data": [
            {"id": m, "object": "model", "owned_by": "local"}
            for m in models
        ],
    }


@router.post("/chat/completions")
async def chat_completions(req: ChatCompletionRequest):
    messages = [m.model_dump() for m in req.messages]

    try:
        if req.stream:
            return StreamingResponse(
                _stream_chunks(req.model, messages, req.max_tokens, req.temperature),
                media_type="text/event-stream",
            )

        result = generate(
            model_id=req.model,
            messages=messages,
            max_tokens=req.max_tokens,
            temperature=req.temperature,
            stream=False,
        )
        return result

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


async def _stream_chunks(
    model_id: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float,
):
    """Yield SSE-formatted chunks from a streaming llama.cpp response."""
    completion_id = f"chatcmpl-{uuid4().hex[:12]}"
    created = int(time.time())

    try:
        stream = generate(
            model_id=model_id,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )

        for chunk in stream:
            delta = chunk.get("choices", [{}])[0].get("delta", {})
            payload = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model_id,
                "choices": [{"index": 0, "delta": delta, "finish_reason": None}],
            }
            yield f"data: {json.dumps(payload)}\n\n"

        # Final chunk with finish_reason
        final = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model_id,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        }
        yield f"data: {json.dumps(final)}\n\n"
        yield "data: [DONE]\n\n"

    except ValueError as exc:
        error_payload = {"error": {"message": str(exc), "type": "invalid_request_error"}}
        yield f"data: {json.dumps(error_payload)}\n\n"
