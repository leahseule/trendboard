// index.html(카드)과 trend.html(트렌드 결과+히스토리)이 공유하는 공통 로직.
// 실제 백엔드(app/main.py)를 호출한다 — 목업 데이터는 더 이상 쓰지 않음.

const SOURCE_LABEL = { geeknews: "GeekNews", aitimes: "AI타임스", naver_it: "네이버 IT" };

function $(sel, root) { return (root || document).querySelector(sel); }

// 외부 RSS/LLM에서 온 텍스트를 innerHTML에 꽂기 전에 반드시 이 함수로 이스케이프한다.
function escapeHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(str ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

// API 비용 없이 ChatGPT/Claude로 넘기는 핸드오프 링크 3종. 카드 화면(app.js)과
// 히스토리(trend.js)가 공유한다 — 히스토리는 예전 조합을 "다시 열기"할 때 같은 함수를 씀.
// 한글 프롬프트 전체를 URL에 실으면 퍼센트 인코딩 때문에 글자당 9배로 불어나 링크가 안 열릴
// 수 있어서, ChatGPT/Claude에는 우리가 호스팅하는 /prompt 페이지로 가는 "짧은 링크"만 준다.
function promptPageUrl(ids, target) {
  const params = new URLSearchParams({ ids: ids.join(",") });
  if (target) params.set("target", target);
  return `${window.location.origin}/prompt?${params.toString()}`;
}

// target === "claude"일 때만 결과를 아티팩트로 만들어달라는 문구를 덧붙인다 — 아티팩트는
// Claude 전용 기능이라 ChatGPT엔 의미가 없음.
function handoffMessage(ids, target) {
  // 짧은 메시지 안의 한글은 퍼센트 인코딩되면 글자당 9배 가까이 불어나(UTF-8 3바이트×%XX)
  // Claude/ChatGPT 쪽 프리필 길이 제한에 걸릴 수 있다(실사용 중 "URL이 너무 길어서
  // 못 불러온다" 확인됨) — 실제 분석 지시문(아티팩트 요청 포함)은 이미 /prompt 페이지
  // 안에 다 있으므로, 여기서는 한글을 최소한으로 줄여 링크를 열어보라는 정도만 남긴다.
  const artifactNote = target === "claude" ? "(아티팩트로)" : "";
  return `아래 글 분석해줘${artifactNote}:\n${promptPageUrl(ids, target)}`;
}

// /prompt 페이지와 같은 내용(기사 목록 + 프롬프트 전문)을 JSON으로 받는다 — 히스토리
// 화면이 별도 페이지로 이동하지 않고 그 자리에서 "다시보기"로 보여줄 때 쓴다.
async function apiPromptData(ids, target) {
  const params = new URLSearchParams({ ids: ids.join(",") });
  if (target) params.set("target", target);
  const res = await fetch(`/api/prompt?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `프리필 내용 요청 실패 (${res.status})`);
  }
  return res.json();
}

function openHandoff(ids, target) {
  const q = encodeURIComponent(handoffMessage(ids, target));
  const url = target === "claude" ? `https://claude.ai/new?q=${q}` : `https://chatgpt.com/?q=${q}`;
  window.open(url, "_blank", "noopener");
}

function formatDateTime(ts) {
  return new Date(ts).toLocaleString("ko-KR", {
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// --- 백엔드 API 래퍼 ---

// range: 없으면 기본(최근 3일). {start, end} 중 하나 이상 주면 그 기간으로 검색(서버가 우선 적용).
async function apiGetItems(source = "all", refresh = false, range = null) {
  const params = new URLSearchParams({ source, refresh: String(refresh) });
  if (range && range.start) params.set("start", range.start);
  if (range && range.end) params.set("end", range.end);
  const res = await fetch(`/api/items?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `items 요청 실패 (${res.status})`);
  }
  const data = await res.json();
  return data.items;
}

async function apiGetUsedItemIds() {
  const res = await fetch("/api/history-used-ids");
  if (!res.ok) throw new Error(`이미 분석한 글 목록 요청 실패 (${res.status})`);
  const data = await res.json();
  return data.ids;
}

async function apiSummarize(id) {
  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `요약 요청 실패 (${res.status})`);
  }
  return res.json();
}

// ChatGPT/Claude로 넘길 때 어떤 글 조합을 보냈는지 "장바구니"로 자동 기록한다.
// OpenAI를 부르지 않으므로 즉시 끝나고, 결과(분석 내용)는 외부 챗에만 남는다.
async function apiCart(ids, method) {
  const res = await fetch("/api/cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, method }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `장바구니 기록 실패 (${res.status})`);
  }
  return res.json();
}

async function apiHistoryList() {
  const res = await fetch("/api/history");
  if (!res.ok) throw new Error(`히스토리 요청 실패 (${res.status})`);
  const data = await res.json();
  return data.history;
}

async function apiHistoryGet(id) {
  const res = await fetch(`/api/history/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

