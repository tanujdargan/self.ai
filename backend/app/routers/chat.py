import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.inference.engine import generate

router = APIRouter(tags=["chat"])


@router.websocket("/ws/chat")
async def websocket_chat(ws: WebSocket):
    await ws.accept()

    try:
        while True:
            raw = await ws.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            model_id = data.get("model_id")
            messages = data.get("messages", [])
            max_tokens = data.get("max_tokens", 512)
            temperature = data.get("temperature", 0.7)

            if not model_id:
                await ws.send_json({"type": "error", "message": "model_id is required"})
                continue
            if not messages:
                await ws.send_json({"type": "error", "message": "messages list is required"})
                continue

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
                    content = delta.get("content", "")
                    if content:
                        await ws.send_json({"type": "token", "content": content})

                await ws.send_json({"type": "done"})

            except ValueError as exc:
                await ws.send_json({"type": "error", "message": str(exc)})

    except WebSocketDisconnect:
        pass
