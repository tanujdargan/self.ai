"""Training worker -- runs as a subprocess.

Reads config from stdin (JSON), writes progress to stdout (JSON lines).
Structured events go to stdout, human-readable debug info goes to stderr.
"""
import json
import logging
import os
import sys
from pathlib import Path

# Reduce CUDA memory fragmentation on consumer GPUs
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

# stderr logging for debug info captured by the manager
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)-8s [worker] %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)
wlog = logging.getLogger("worker")


def log(data: dict):
    """Send structured JSON event to stdout (read by manager)."""
    print(json.dumps(data), flush=True)
    wlog.debug("event=%s %s", data.get("event", "?"), data.get("message", ""))


def train(config: dict):
    log({"event": "start", "message": "Loading model and tokenizer..."})

    try:
        # Authenticate with HuggingFace for gated models
        hf_token = config.get("hf_token")
        if hf_token:
            from huggingface_hub import login
            login(token=hf_token, add_to_git_credential=False)
            wlog.info("Logged in to HuggingFace")
        else:
            wlog.warning("No HF token provided — gated models will fail")

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

        # Load quantization config — normalize frontend values (int4/int8) to internal (4bit/8bit)
        quant_raw = config.get("quantization", "int4") or "int4"
        quant_map = {"int4": "4bit", "int8": "8bit", "4bit": "4bit", "8bit": "8bit", "none": "none"}
        quant = quant_map.get(quant_raw, quant_raw)
        wlog.info("Quantization: raw=%s resolved=%s device=%s", quant_raw, quant, device_type)

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
            token=hf_token,
        )
        tokenizer = AutoTokenizer.from_pretrained(
            config["base_model"],
            cache_dir=config.get("cache_dir"),
            token=hf_token,
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
        if config.get("data_format", "style") == "style":
            texts = [
                f"<|user|>\n{item['instruction']}\n<|assistant|>\n{item['output']}"
                for item in raw_data
            ]
        else:
            texts = [
                f"<|user|>\nAnalyze this conversation:\n{item['conversation']}\n<|assistant|>\n"
                for item in raw_data
            ]

        max_seq_length = config.get("max_seq_length", 2048)
        wlog.info("Tokenizing %d examples (max_length=%d)", len(texts), max_seq_length)

        def tokenize(examples):
            return tokenizer(
                examples["text"],
                truncation=True,
                max_length=max_seq_length,
                padding=False,
            )

        dataset = Dataset.from_dict({"text": texts})
        tokenized = dataset.map(tokenize, batched=True, remove_columns=["text"])

        # Split — dataset_split may be a float ratio or the string "train" (= no split)
        split_val = config.get("dataset_split", 0.1)
        try:
            split_ratio = float(split_val)
        except (TypeError, ValueError):
            split_ratio = 0.0

        if 0 < split_ratio < 1 and len(tokenized) > 10:
            split = tokenized.train_test_split(test_size=split_ratio, seed=config.get("shuffle_seed", 42))
            train_dataset = split["train"]
            eval_dataset = split["test"]
        else:
            train_dataset = tokenized
            eval_dataset = None

        log({"event": "progress", "message": f"Training on {len(train_dataset)} examples...", "percent": 25})

        # Auto-tune batch size and enable gradient checkpointing for limited VRAM
        batch_size = config.get("batch_size", 4)
        grad_accum = config.get("gradient_accumulation_steps", 4)
        use_gradient_checkpointing = False

        if device_type == "cuda":
            vram_gb = torch.cuda.get_device_properties(0).total_mem / (1024**3)
            wlog.info("VRAM: %.1f GB", vram_gb)

            # Enable gradient checkpointing — essential for QLoRA on consumer GPUs
            use_gradient_checkpointing = True
            model.gradient_checkpointing_enable()
            model.enable_input_require_grads()

            # Auto-reduce batch size for limited VRAM
            if vram_gb < 16:
                effective_batch = batch_size * grad_accum
                batch_size = 1
                grad_accum = max(effective_batch, 8)
                wlog.info("VRAM < 16GB: batch_size=1, grad_accum=%d", grad_accum)
            elif vram_gb < 24:
                if batch_size > 2:
                    effective_batch = batch_size * grad_accum
                    batch_size = 2
                    grad_accum = max(effective_batch // 2, 4)
                    wlog.info("VRAM < 24GB: batch_size=2, grad_accum=%d", grad_accum)

            log({"event": "progress", "message": f"VRAM: {vram_gb:.0f}GB — batch={batch_size}, grad_accum={grad_accum}, grad_ckpt=on", "percent": 25})

        output_dir = config["output_dir"]
        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=config.get("num_epochs", 3),
            max_steps=config.get("max_steps", -1),
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=grad_accum,
            gradient_checkpointing=use_gradient_checkpointing,
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
        wlog.exception("Training failed")
        log({"event": "error", "message": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    raw = sys.stdin.read()
    wlog.info("Worker started, config length=%d bytes", len(raw))
    config = json.loads(raw)
    wlog.info("Config: mode=%s model=%s data_path=%s",
              config.get("mode"), config.get("base_model"), config.get("data_path"))
    train(config)
