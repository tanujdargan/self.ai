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

    gguf_output = Path(output_path) / f"model-{gguf_quantization}.gguf"

    # First convert to f16 GGUF
    f16_path = Path(output_path) / "model-f16.gguf"
    subprocess.run(
        [sys.executable, "-m", "llama_cpp.convert",
         str(merged_path), "--outfile", str(f16_path), "--outtype", "f16"],
        check=True,
    )

    # Then quantize if needed
    if gguf_quantization != "F16":
        subprocess.run(
            ["llama-quantize", str(f16_path), str(gguf_output), gguf_quantization],
            check=True,
        )
        f16_path.unlink(missing_ok=True)
    else:
        gguf_output = f16_path

    log({"event": "progress", "message": "GGUF conversion complete!", "percent": 99})
    return str(gguf_output)
