import asyncio
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from uuid import uuid4

from app.config import settings
from app.services.data_formatter import format_for_style

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
    return conversations


def detect_self_name(conversations: list[dict]) -> str | None:
    """Auto-detect the user's name by finding the participant in the most conversations."""
    convo_participants: Counter[str] = Counter()
    for convo in conversations:
        for name in set(convo.get("participants", [])):
            convo_participants[name] += 1
    if not convo_participants:
        return None
    return convo_participants.most_common(1)[0][0]


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

    return {"run_id": run_id, "detected_self_name": self_name}


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
