import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.fileutil import write_text_resilient

# RSS 피드 자체가 최신 ~50개만 노출해서(대략 1~1.5일치) "최근 3일" 요구를 못 채운다.
# 그래서 매 fetch마다 결과를 여기 누적 저장해두고, 3일/기간검색은 이 아카이브를 기준으로 필터링한다.
# 배포 직후에는 아카이브가 비어 있어 실제로 3일치가 쌓이려면 서비스가 며칠 돌아가야 한다.

ITEMS_FILE = Path(__file__).resolve().parent.parent / "data" / "items.json"
RETENTION_DAYS = 14


def _load() -> dict:
    if not ITEMS_FILE.exists():
        return {}
    try:
        return json.loads(ITEMS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save(data: dict):
    write_text_resilient(ITEMS_FILE, json.dumps(data, ensure_ascii=False, indent=2))


def _within_retention(item: dict) -> bool:
    pub = item.get("published")
    if not pub:
        return True
    try:
        pub_dt = datetime.fromisoformat(pub)
    except ValueError:
        return True
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    return pub_dt >= cutoff


def merge(source: str, fresh_items: list) -> list:
    """fresh_items를 소스별 아카이브에 합친다(같은 id는 최신 내용으로 덮어씀).
    보관기한(RETENTION_DAYS) 지난 항목은 정리한 뒤 저장하고, 합쳐진 리스트를 반환한다."""
    data = _load()
    bucket = {item["id"]: item for item in data.get(source, [])}
    for item in fresh_items:
        bucket[item["id"]] = item
    merged = [i for i in bucket.values() if _within_retention(i)]
    merged.sort(key=lambda x: x.get("published", ""), reverse=True)
    data[source] = merged
    _save(data)
    return merged


def get_source(source: str) -> list:
    return _load().get(source, [])


def get_all() -> list:
    data = _load()
    all_items = [item for items in data.values() for item in items]
    all_items.sort(key=lambda x: x.get("published", ""), reverse=True)
    return all_items


def save_item(item: dict):
    """개별 항목 하나를 갱신(예: AI 요약 결과 추가)하고 저장한다."""
    data = _load()
    bucket = data.get(item["source"], [])
    for i, existing in enumerate(bucket):
        if existing["id"] == item["id"]:
            bucket[i] = item
            break
    else:
        bucket.append(item)
    data[item["source"]] = bucket
    _save(data)


def find_item(item_id: str):
    data = _load()
    for items in data.values():
        for item in items:
            if item["id"] == item_id:
                return item
    return None
