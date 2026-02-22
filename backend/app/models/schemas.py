from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------- Chat / Conversation ----------

class Message(BaseModel):
    sender: str
    timestamp: datetime
    content: str
    type: str = "text"


class Conversation(BaseModel):
    source: str
    conversation_id: str
    participants: list[str]
    messages: list[Message]


# ---------- Training ----------

class TrainingConfig(BaseModel):
    mode: str = Field(..., description="Training mode: 'full' or 'lora'")
    base_model: str = Field(..., description="HuggingFace model ID or local path")
    preset: Optional[str] = Field(None, description="Named preset to load defaults from")

    # Quantization
    quantization: Optional[str] = Field(None, description="Quantization method (e.g. 'int4', 'int8')")

    # LoRA settings
    lora_rank: int = 64
    lora_alpha: int = 128
    lora_dropout: float = 0.05

    # Learning rate
    learning_rate: float = 2e-4
    lr_scheduler: str = "cosine"

    # Training loop
    num_epochs: int = 3
    max_steps: int = -1
    batch_size: int = 4
    gradient_accumulation_steps: int = 4
    max_seq_length: int = 2048
    packing: bool = True

    # Dataset
    dataset_split: str = "train"
    shuffle_seed: int = 42

    # Regularization
    weight_decay: float = 0.01
    warmup_ratio: float = 0.03
    max_grad_norm: float = 1.0

    # Checkpointing / logging
    save_steps: int = 100
    max_checkpoints: int = 3
    logging_steps: int = 10
    eval_steps: int = 100

    # Early stopping
    early_stopping: bool = False
    early_stopping_patience: int = 3

    # LoRA target modules
    target_modules: Optional[list[str]] = None

    # GGUF export
    gguf_quantization: Optional[str] = Field(None, description="GGUF quantization type (e.g. 'Q4_K_M')")
    merge_before_convert: bool = True
    keep_adapter: bool = True


class TrainingRunResponse(BaseModel):
    id: str
    mode: str
    base_model: str
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    metrics_json: Optional[str] = None
    output_path: Optional[str] = None
    error: Optional[str] = None


# ---------- Models ----------

class ModelResponse(BaseModel):
    id: str
    name: str
    mode: str
    base_model: str
    training_run_id: Optional[str] = None
    gguf_path: Optional[str] = None
    adapter_path: Optional[str] = None
    created_at: str
    is_loaded: bool = False
    config_json: Optional[str] = None


# ---------- Hardware ----------

class HardwareInfo(BaseModel):
    cpu: str
    cpu_cores: int
    ram_gb: float
    gpu_name: Optional[str] = None
    gpu_vram_gb: Optional[float] = None
    gpu_backend: Optional[str] = None
    os: str
    recommended_mode: str = "cpu"
