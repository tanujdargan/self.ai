from __future__ import annotations

from threading import Lock
from typing import TYPE_CHECKING, Any, Iterator

if TYPE_CHECKING:
    from llama_cpp import Llama

_models: dict[str, Any] = {}
_lock = Lock()


def _get_llama_class():
    from llama_cpp import Llama
    return Llama


def load_model(
    model_id: str,
    gguf_path: str,
    n_ctx: int = 4096,
    n_gpu_layers: int = -1,
) -> None:
    with _lock:
        if model_id in _models:
            unload_model(model_id)
        Llama = _get_llama_class()
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
    return model.create_chat_completion(
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        stream=stream,
    )
