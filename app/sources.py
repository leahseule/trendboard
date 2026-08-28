import hashlib
import html as html_lib
import re
import time
from datetime import datetime, timezone

import feedparser
import httpx
from bs4 import BeautifulSoup

from app import items_store

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    text = _TAG_RE.sub(" ", text or "")
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()

GEEKNEWS_RSS_URL = "https://news.hada.io/rss/news"
AITIMES_RSS_URL = "https://www.aitimes.com/rss/allArticle.xml"
NAVER_IT_URL = "https://news.naver.com/section/105"
# 네이버 뉴스는 공개 RSS를 제공하지 않아(구 RSS 엔드포인트 확인해보니 전부 404) 섹션
# 페이지를 직접 스크레이핑한다. 목록 페이지에는 절대 발행시각이 없어 "수집 시각"을
# published로 대신 쓴다 — 페이지 자체가 최신순 정렬이라 큰 문제는 없지만, 정확한
# 발행시각은 아니라는 점은 감안해야 한다. 마크업이 바뀌면 이 파서도 깨질 수 있음.
NAVER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

_cache = {}  # source_key -> {"items": [...], "fetched_at": float}
CACHE_TTL = 20 * 60


def _make_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]


def make_id(url: str) -> str:
    """url로부터 item id를 계산하는 공개 버전 — id를 저장 안 한 예전 히스토리 항목을
    url로 다시 매칭할 때 씀."""
    return _make_id(url) if url else ""


def _parsed_date(entry) -> str:
    struct = entry.get("published_parsed") or entry.get("updated_parsed")
    if not struct:
        return ""
    return datetime(*struct[:6], tzinfo=timezone.utc).isoformat()


async def _fetch_rss(url: str, source: str, max_results: int):
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    # bytes(resp.content)로 넘겨야 feedparser가 피드 자체의 인코딩 선언을 보고 정확히 디코딩한다
    # (resp.text는 httpx의 charset 추정에 의존해 한글이 깨질 수 있음)
    feed = feedparser.parse(resp.content)
    items = []
    for entry in feed.entries[:max_results]:
        link = entry.link
        items.append({
            "id": _make_id(link),
            "source": source,
            "title": _strip_html(entry.title),
            "url": link,
            "published": _parsed_date(entry),
            "authors": entry.get("author", ""),
            "raw_text": _strip_html(entry.get("summary", "")),
        })
    return items


async def fetch_geeknews(max_results: int = 50):
    return await _fetch_rss(GEEKNEWS_RSS_URL, "geeknews", max_results)


async def fetch_aitimes(max_results: int = 50):
    return await _fetch_rss(AITIMES_RSS_URL, "aitimes", max_results)


async def fetch_naver_it(max_results: int = 50):
    async with httpx.AsyncClient(timeout=15, headers=NAVER_HEADERS) as client:
        resp = await client.get(NAVER_IT_URL)
        resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    scraped_at = datetime.now(timezone.utc).isoformat()
    items = []
    seen = set()
    for link in soup.select("a.sa_text_title"):
        url = (link.get("href") or "").strip()
        if not url or url in seen:
            continue
        strong = link.select_one("strong.sa_text_strong")
        title = _strip_html((strong or link).get_text(strip=True))
        if not title:
            continue
        seen.add(url)
        container = link.find_parent("div", class_="sa_text")
        lede_el = container.select_one(".sa_text_lede") if container else None
        items.append({
            "id": _make_id(url),
            "source": "naver_it",
            "title": title,
            "url": url,
            "published": scraped_at,
            "authors": "",
            "raw_text": _strip_html(lede_el.get_text(strip=True)) if lede_el else "",
        })
        if len(items) >= max_results:
            break
    return items


SOURCE_FETCHERS = {
    "geeknews": fetch_geeknews,
    "aitimes": fetch_aitimes,
    "naver_it": fetch_naver_it,
}

# 원문 기사 본문을 스크레이핑할 때 쓰는 소스별 (본문 컨테이너 셀렉터, 안에서 제거할 요소들).
# GeekNews는 자체 원문이 없다(외부 링크를 큐레이션만 함) — raw_text(RSS 발췌)가 이미 사실상
# 전문이라 별도 스크레이핑 없이 그대로 씀.
FULL_TEXT_SELECTORS = {
    "aitimes": ("#article-view-content-div", ["script", "style"]),
    "naver_it": ("#dic_area", ["script", "style", "span.end_photo_org"]),
}
FULL_TEXT_LIMIT = 8000  # 비정상적으로 긴 페이지를 만났을 때의 안전장치. 일반 기사 길이는 훨씬 짧음.


async def fetch_full_text(item: dict) -> str:
    """원문 기사 본문 전체를 스크레이핑한다. 실패하거나 지원 안 하는 소스면 raw_text(RSS
    발췌)로 폴백한다 — 프롬프트 자체가 비는 것보다 짧은 발췌라도 있는 게 낫다."""
    source = item.get("source")
    url = item.get("url", "")
    fallback = item.get("raw_text", "")
    selector_info = FULL_TEXT_SELECTORS.get(source)
    if not selector_info or not url:
        return fallback
    selector, strip_selectors = selector_info
    try:
        async with httpx.AsyncClient(timeout=10, headers=NAVER_HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except Exception:
        return fallback
    soup = BeautifulSoup(resp.text, "html.parser")
    body = soup.select_one(selector)
    if not body:
        return fallback
    for strip_sel in strip_selectors:
        for tag in body.select(strip_sel):
            tag.decompose()
    text = body.get_text("\n", strip=True)
    if not text:
        return fallback
    if len(text) > FULL_TEXT_LIMIT:
        text = text[:FULL_TEXT_LIMIT].rstrip() + "\n…(이하 생략, 원문 링크 참고)"
    return text


async def get_items(source: str = "all", force_refresh: bool = False):
    """소스를 최신화(TTL 캐시 or 강제 새로고침)하고, 응답은 items_store 아카이브 전체에서
    반환한다 — RSS 자체는 최근 ~50개(1~1.5일치)만 주므로, "최근 3일"·기간검색은 매번 누적된
    아카이브를 봐야 의미가 있다."""
    keys = list(SOURCE_FETCHERS) if source == "all" else [source]
    for key in keys:
        cached = _cache.get(key)
        if not force_refresh and cached and (time.time() - cached["fetched_at"] < CACHE_TTL):
            continue
        try:
            fresh = await SOURCE_FETCHERS[key]()
        except Exception:
            fresh = None
        if fresh is not None:
            _cache[key] = {"fetched_at": time.time()}
            items_store.merge(key, fresh)

    if source == "all":
        return items_store.get_all()
    return items_store.get_source(source)


def find_item(item_id: str):
    return items_store.find_item(item_id)


def save_item(item: dict):
    items_store.save_item(item)
