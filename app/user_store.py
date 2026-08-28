import time
import json
import uuid
from pathlib import Path

from app.fileutil import write_text_resilient

USERS_FILE = Path(__file__).resolve().parent.parent / "data" / "users.json"


def _load():
    if not USERS_FILE.exists():
        return []
    try:
        return json.loads(USERS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save(users):
    write_text_resilient(USERS_FILE, json.dumps(users, ensure_ascii=False, indent=2))


def find_by_username(username: str):
    for user in _load():
        if user["username"] == username:
            return user
    return None


def find_by_id(user_id: str):
    for user in _load():
        if user["id"] == user_id:
            return user
    return None


def create_user(username: str, password_hash: str):
    user = {
        "id": f"u_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}",
        "username": username,
        "password_hash": password_hash,
        "createdAt": int(time.time() * 1000),
    }
    users = _load()
    users.append(user)
    _save(users)
    return user
