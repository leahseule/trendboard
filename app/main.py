import asyncio
import html as html_lib
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import history_store, sources, summarize

app = FastAPI(title="TrendBoard")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

SOURCE_LABEL = {"geeknews": "GeekNews", "aitimes": "AI타임스", "naver_it": "네이버 IT"}


def _truncate(text: str, limit: int = 100) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def _format_meta(item: dict) -> str:
    label = SOURCE_LABEL.get(item["source"], item["source"])
    date_str = (item.get("published") or "")[:10]
    return f"{label} · {date_str}" if date_str else label


def _serialize_item(item: dict) -> dict:
    out = {
        "id": item["id"],
        "source": item["source"],
        "title": item["title"],
        "url": item["url"],
        "meta": _format_meta(item),
        "excerpt": _truncate(item.get("raw_text", "")),
    }
    if "summary_lines" in item:
        out["summary"] = item["summary_lines"]
        out["keywords"] = item["keywords"]
    return out


@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health():
    return {"ok": True, "ai_enabled": summarize.get_client() is not None}


def _parse_date_param(s: str, end_of_day: bool = False) -> datetime:
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"날짜 형식이 올바르지 않습니다: {s} (예: 2026-08-25)")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    if end_of_day:
        dt = dt.replace(hour=23, minute=59, second=59)
    return dt


def _in_range(item: dict, since: datetime | None, until: datetime | None) -> bool:
    pub = item.get("published")
    if not pub:
        return False
    try:
        pub_dt = datetime.fromisoformat(pub)
    except ValueError:
        return False
    if since and pub_dt < since:
        return False
    if until and pub_dt > until:
        return False
    return True


@app.api_route("/api/items", methods=["GET", "HEAD"])
async def api_items(
    source: str = "all",
    refresh: bool = False,
    days: int = 3,
    start: str | None = None,
    end: str | None = None,
):
    items = await sources.get_items(source=source, force_refresh=refresh)
    now = datetime.now(timezone.utc)
    if start or end:
        since = _parse_date_param(start) if start else None
        until = _parse_date_param(end, end_of_day=True) if end else None
        if since and since > now:
            raise HTTPException(status_code=400, detail="시작일은 오늘보다 미래일 수 없습니다.")
        if until and until > now:
            until = now
        if since and until and since > until:
            raise HTTPException(status_code=400, detail="시작일이 종료일보다 늦을 수 없습니다.")
    else:
        since = now - timedelta(days=days)
        until = None
    items = [i for i in items if _in_range(i, since, until)]
    return {"items": [_serialize_item(i) for i in items]}


class SummarizeRequest(BaseModel):
    id: str


@app.post("/api/summarize")
async def api_summarize(req: SummarizeRequest):
    item = sources.find_item(req.id)
    if not item:
        raise HTTPException(status_code=404, detail="item not found")
    if "summary_lines" not in item:
        result = summarize.summarize_item(item["title"], item.get("raw_text", ""))
        if result is None:
            raise HTTPException(status_code=503, detail="AI 요약 비활성 (OPENAI_API_KEY 미설정)")
        item["summary_lines"] = result["summary_lines"]
        item["keywords"] = result["keywords"]
        sources.save_item(item)
    return _serialize_item(item)


def _resolve_picked(ids: list[str]) -> list[dict]:
    picked = [sources.find_item(item_id) for item_id in ids]
    return [i for i in picked if i]


class CartRequest(BaseModel):
    ids: list[str]
    method: str  # "chatgpt" | "claude" — ChatGPT/Claude로 넘길 때 어떤 글 조합을 보냈는지
    # "장바구니"로 자동 기록한다. OpenAI 호출은 안 함 — 결과는 외부 챗에서만 나옴.


@app.post("/api/cart")
async def api_cart(req: CartRequest):
    picked = _resolve_picked(req.ids)
    if not picked:
        raise HTTPException(status_code=400, detail="no valid items")
    entry = history_store.add_entry({
        "sources": sorted({i["source"] for i in picked}),
        "selectedItems": [{"id": i["id"], "title": i["title"], "url": i["url"], "source": i["source"]} for i in picked],
        "method": req.method,
    })
    return entry


async def _build_full_text_input(picked: list[dict]) -> list[dict]:
    texts = await asyncio.gather(*[sources.fetch_full_text(i) for i in picked])
    return [
        {"title": i["title"], "source": i["source"], "url": i["url"], "excerpt": t}
        for i, t in zip(picked, texts)
    ]


async def _build_prompt_data(ids: str, target: str | None) -> tuple[list[dict], str]:
    """선택한 글들의 원문 링크·본문 전체(가능한 소스는 스크레이핑, 안 되면 RSS 발췌로 대체)로
    분석 지시문을 만든다 — DB 저장 없이 매 요청마다 ids로부터 그대로 다시 만든다. `/prompt`
    (ChatGPT/Claude가 여는 페이지)와 `/api/prompt`(히스토리 화면이 같은 내용을 인라인으로
    보여줄 때 쓰는 JSON)가 공유한다."""
    id_list = [x for x in ids.split(",") if x]
    picked = _resolve_picked(id_list)
    if not picked:
        raise HTTPException(status_code=404, detail="no valid items")
    full_input = await _build_full_text_input(picked)
    prompt_text = summarize.build_trend_prompt_for_chat(full_input, want_artifact=(target == "claude"))
    return full_input, prompt_text


@app.api_route("/api/prompt", methods=["GET", "HEAD"])
async def api_prompt(ids: str, target: str | None = None):
    full_input, prompt_text = await _build_prompt_data(ids, target)
    return {
        "items": [{"source": i["source"], "title": i["title"], "url": i["url"]} for i in full_input],
        "promptText": prompt_text,
    }


@app.api_route("/prompt", methods=["GET", "HEAD"], response_class=HTMLResponse)
async def prompt_page(ids: str, target: str | None = None):
    """API 비용 없이 ChatGPT/Claude로 넘기는 핸드오프용 페이지. 카드 화면에서는 이 페이지로
    가는 짧은 링크만 ChatGPT/Claude에 전달한다(전체 프롬프트를 URL에 실으면 한글 퍼센트
    인코딩 때문에 URL이 감당 못 할 만큼 길어짐). target=claude면 결과를 마크다운 아티팩트로
    만들어달라는 지시를 덧붙인다(Claude 전용 기능이라 ChatGPT엔 안 씀)."""
    full_input, prompt_text = await _build_prompt_data(ids, target)

    sources_html = "".join(
        f'<li><span class="src">[{html_lib.escape(SOURCE_LABEL.get(i["source"], i["source"]))}]</span> '
        f'<a href="{html_lib.escape(i["url"])}" target="_blank" rel="noopener noreferrer">{html_lib.escape(i["title"])}</a></li>'
        for i in full_input
    )

    body = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TrendBoard 분석 요청</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+KR:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px;
         margin: 40px auto; padding: 0 20px 60px; line-height: 1.6; color: #1a1a1a; }}
  h1 {{ font-size: 1.2rem; }}
  .note {{ color: #555; font-size: 0.92rem; }}
  ul.sources {{ padding-left: 18px; }}
  ul.sources li {{ margin-bottom: 6px; font-size: 0.92rem; }}
  .src {{ color: #777; }}
  button {{ margin: 16px 0; padding: 8px 16px; cursor: pointer; border: 1px solid #ccc;
           border-radius: 6px; background: #fff; }}
  pre {{ white-space: pre-wrap; word-break: break-word; background: #f6f6f6; padding: 20px;
        border-radius: 8px; font-size: 0.78rem; line-height: 2;
        font-family: "JetBrains Mono", "Noto Sans KR", "Pretendard", "Consolas", "Menlo", "Monaco", monospace; }}
</style>
</head>
<body>
<h1>TrendBoard 분석 요청</h1>
<p class="note">TrendBoard에서 선택한 글들의 분석 지시문입니다. 아래 원문 링크·본문을 참고해서 지시대로 분석해 주세요.</p>
<ul class="sources">{sources_html}</ul>
<button onclick="navigator.clipboard.writeText(document.getElementById('prompt-text').textContent)">전체 복사</button>
<pre id="prompt-text">{html_lib.escape(prompt_text)}</pre>
</body>
</html>"""
    return HTMLResponse(body)


@app.api_route("/api/history", methods=["GET", "HEAD"])
async def api_history_list():
    return {"history": history_store.list_history()}


@app.api_route("/api/history-used-ids", methods=["GET", "HEAD"])
async def api_history_used_ids():
    """지금까지 트렌드 분석에 한 번이라도 포함됐던 글의 id 목록. 카드 목록에서
    "이미 분석함" 표시를 하는 데 쓴다. 예전 히스토리(id 저장 전)는 url로 id를 다시 계산해 맞춘다."""
    ids = set()
    for entry in history_store.list_history():
        for item in entry.get("selectedItems", []):
            item_id = item.get("id") or sources.make_id(item.get("url", ""))
            if item_id:
                ids.add(item_id)
    return {"ids": sorted(ids)}


@app.api_route("/api/history/{entry_id}", methods=["GET", "HEAD"])
async def api_history_get(entry_id: str):
    entry = history_store.get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="not found")
    return entry


# /api/* 라우트들 뒤에 마지막으로 등록해야 함 — html=True라 "/"는 index.html,
# "/trend.html"·"/style.css" 등은 같은 폴더 안 파일을 그대로 서빙(상대경로 그대로 동작).
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
