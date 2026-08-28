// index.html(카드)과 trend.html(트렌드 결과+히스토리)이 공유하는 공통 로직.
// 실제 백엔드(app/main.py)를 호출한다 — 목업 데이터는 더 이상 쓰지 않음.

const SOURCE_LABEL = { geeknews: "GeekNews", aitimes: "AI타임스", naver_it: "네이버 IT" };

function $(sel, root) { return (root || document).querySelector(sel); }

// 외부 RSS/LLM에서 온 텍스트를 innerHTML에 꽂기 전에 반드시 이 함수로 이스케이프한다.
function escapeHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(str ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

function insightCardHtml(insight) {
  const tags = (insight.tags || []).map((k) => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join("");
  return `
    <div class="insight-card">
      <div class="insight-slot">${escapeHtml(insight.slot)}</div>
      <div class="keywords">${tags}</div>
      <div class="insight-row"><span class="insight-label">무엇이 보이는가</span><p>${escapeHtml(insight.whatIsSeen)}</p></div>
      <div class="insight-row"><span class="insight-label">왜 이게 중요한가</span><p>${escapeHtml(insight.whyItMatters)}</p></div>
      <div class="insight-row"><span class="insight-label">어디로 이어지는가</span><p>${escapeHtml(insight.whereItLeads)}</p></div>
      <div class="insight-row critical"><span class="insight-label">비판적으로 볼 지점</span><p>${escapeHtml(insight.criticalView)}</p></div>
    </div>`;
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

async function apiTrend(ids) {
  const res = await fetch("/api/trend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `트렌드 분석 요청 실패 (${res.status})`);
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

async function apiHistoryClear() {
  const res = await fetch("/api/history", { method: "DELETE" });
  if (!res.ok) throw new Error(`히스토리 삭제 실패 (${res.status})`);
  return res.json();
}
