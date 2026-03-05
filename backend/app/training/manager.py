import asyncio
import json
import logging
import subprocess
import sys
from collections import Counter
from pathlib import Path
from uuid import uuid4

from app.config import settings
from app.services.data_formatter import format_for_style

logger = logging.getLogger("selfai.train")

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


def load_parsed_conversations() -> list[dict]:
    """Load all parsed conversation JSON files, normalizing to a flat list."""
    conversations: list[dict] = []
    parsed_dir = settings.parsed_dir
    if not parsed_dir.exists():
        return conversations
    for path in sorted(parsed_dir.glob("*.json")):
        data = json.loads(path.read_text())
        if isinstance(data, list):
            conversations.extend(data)
        else:
            conversations.append(data)
    logger.debug("Loaded %d conversations from %s", len(conversations), parsed_dir)
    return conversations


def detect_self_name(conversations: list[dict]) -> str | None:
    """Auto-detect the user's name by finding the participant in the most conversations."""
    convo_participants: Counter[str] = Counter()
    for convo in conversations:
        participants = convo.get("participants", [])
        if not participants:
            # Derive from message senders (email parser doesn't emit participants)
            participants = list({m["sender"] for m in convo.get("messages", []) if m.get("sender")})
        for name in set(participants):
            convo_participants[name] += 1
    if not convo_participants:
        return None
    name = convo_participants.most_common(1)[0][0]
    logger.debug("Auto-detected self_name=%s (top 5: %s)", name, convo_participants.most_common(5))
    return name


async def _get_hf_token() -> str | None:
    """Read HuggingFace token from DB settings."""
    from app.db.database import get_db
    db = await get_db()
    try:
        cursor = await db.execute("SELECT value FROM app_settings WHERE key = 'hf_token'")
        row = await cursor.fetchone()
        return row["value"] if row else None
    finally:
        await db.close()


async def start_training(config: dict) -> dict:
    """Prepare training data from parsed conversations and spawn worker.

    Returns dict with run_id and detected_self_name.
    Raises ValueError if no data or no training examples.
    """
    # Collect and format training data
    conversations = load_parsed_conversations()
    if not conversations:
        raise ValueError("No imported conversation data found. Import conversations first.")

    self_name = config.get("self_name") or detect_self_name(conversations)
    if not self_name:
        raise ValueError("Could not detect your name. Import conversations with participants.")

    training_examples = format_for_style(conversations, self_name)
    logger.info("Formatted %d training examples for self_name=%s from %d conversations",
                len(training_examples), self_name, len(conversations))

    # Cap examples to prevent OOM — 50K pairs is plenty for style fine-tuning
    MAX_EXAMPLES = 50_000
    if len(training_examples) > MAX_EXAMPLES:
        logger.warning("Capping training examples from %d to %d to prevent OOM",
                        len(training_examples), MAX_EXAMPLES)
        training_examples = training_examples[:MAX_EXAMPLES]

    if not training_examples:
        raise ValueError(
            f"No training examples generated for '{self_name}'. "
            "Check that this name matches a participant in your conversations."
        )

    run_id = uuid4().hex[:12]
    output_dir = str(settings.adapters_dir / run_id)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Write formatted training data
    settings.training_dir.mkdir(parents=True, exist_ok=True)
    data_path = settings.training_dir / f"{run_id}.json"
    data_path.write_text(json.dumps(training_examples))

    config["output_dir"] = output_dir
    config["cache_dir"] = str(settings.base_models_dir)
    config["data_path"] = str(data_path)
    config["data_format"] = "style"

    # Inject HF token for gated model access
    hf_token = await _get_hf_token()
    if hf_token:
        config["hf_token"] = hf_token
        logger.info("HF token found, passing to worker")
    else:
        logger.warning("No HF token configured — gated models will fail to download")

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
    logger.info("Worker spawned: run_id=%s pid=%d data_path=%s examples=%d",
                run_id, process.pid, data_path, len(training_examples))

    # Start monitoring in background
    asyncio.create_task(_monitor_job(run_id, process))

    return {"run_id": run_id, "detected_self_name": self_name}


async def _read_stdout(run_id: str, process: subprocess.Popen, loop: asyncio.AbstractEventLoop):
    """Read structured JSON events from worker stdout and forward to subscribers."""
    while True:
        line = await loop.run_in_executor(None, process.stdout.readline)
        if not line:
            break
        line = line.strip()
        try:
            data = json.loads(line)
            data["run_id"] = run_id
            logger.debug("Worker[%s]: %s", run_id, data.get("event", "?"))
            for queue in _job_subscribers.get(run_id, []):
                await queue.put(data)
        except json.JSONDecodeError:
            logger.info("Worker[%s] stdout: %s", run_id, line)


async def _read_stderr(run_id: str, process: subprocess.Popen, loop: asyncio.AbstractEventLoop) -> list[str]:
    """Stream worker stderr lines to the server log and forward status updates to frontend."""
    lines: list[str] = []
    while True:
        line = await loop.run_in_executor(None, process.stderr.readline)
        if not line:
            break
        line = line.rstrip()
        lines.append(line)
        logger.info("Worker[%s] stderr: %s", run_id, line)

        # Forward download/loading progress to frontend as status updates
        lower = line.lower()
        if any(kw in lower for kw in ("downloading", "loading", "tokenizer", "fetching", "model.safetensors")):
            for queue in _job_subscribers.get(run_id, []):
                await queue.put({
                    "run_id": run_id,
                    "event": "progress",
                    "message": line.strip(),
                    "percent": 5,
                })
    return lines


async def _monitor_job(run_id: str, process: subprocess.Popen):
    try:
        loop = asyncio.get_event_loop()

        # Read stdout and stderr in parallel so neither blocks the other
        stdout_task = asyncio.create_task(_read_stdout(run_id, process, loop))
        stderr_task = asyncio.create_task(_read_stderr(run_id, process, loop))

        await stdout_task
        # Give stderr a moment to finish after stdout closes
        try:
            stderr_lines = await asyncio.wait_for(stderr_task, timeout=10.0)
        except asyncio.TimeoutError:
            logger.warning("Worker[%s] stderr read timed out", run_id)
            stderr_lines = []

        process.wait()

        if process.returncode != 0:
            logger.error("Worker[%s] exited with code %d", run_id, process.returncode)
        else:
            logger.info("Worker[%s] finished successfully", run_id)

        final = {
            "run_id": run_id,
            "event": "finished",
            "return_code": process.returncode,
        }
        if process.returncode != 0 and stderr_lines:
            final["stderr"] = "\n".join(stderr_lines[-10:])
        for queue in _job_subscribers.get(run_id, []):
            await queue.put(final)

    except Exception:
        logger.exception("Monitor task crashed for run_id=%s", run_id)
    finally:
        _active_jobs.pop(run_id, None)


def cancel_training(run_id: str) -> bool:
    process = _active_jobs.get(run_id)
    if process:
        process.terminate()
        _active_jobs.pop(run_id, None)
        return True
    return False
