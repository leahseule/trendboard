import json
import time
import uuid
from pathlib import Path

from app.fileutil import write_text_resilient

HISTORY_FILE = Path(__file__).resolve().parent.parent / "data" / "history.json"


def _load():
    if not HISTORY_FILE.exists():
        return []
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save(entries):
    write_text_resilient(HISTORY_FILE, json.dumps(entries, ensure_ascii=False, indent=2))


def list_history():
    return _load()


def get_entry(entry_id: str):
    for entry in _load():
        if entry["id"] == entry_id:
            return entry
    return None


def add_entry(data: dict):
    entry = {
        "id": f"t_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}",
        "createdAt": int(time.time() * 1000),
        **data,
    }
    entries = _load()
    entries.insert(0, entry)
    _save(entries)
    return entry
