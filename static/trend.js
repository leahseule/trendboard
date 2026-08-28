// 장바구니 히스토리(Obsidian 스타일 SNB) 화면 로직. ChatGPT/Claude로 보낼 때 어떤 글
// 조합을 보냈는지의 기록이다 — OpenAI 분석 결과 자체는 없다(외부 챗에만 남음).
// promptPageUrl/openHandoff 등은 common.js 공유("다시 열기"가 app.js의 핸드오프와 동일 로직).

let historyCache = [];
let activeId = null;

function idFromQuery() {
  return new URLSearchParams(window.location.search).get("id");
}

function selectedItemRowHtml(item) {
  const inner = `
    <span class="badge ${item.source}">${escapeHtml(SOURCE_LABEL[item.source] || item.source)}</span>
    <span class="selected-item-title">${escapeHtml(item.title)}</span>
  `;
  if (!item.url) {
    return `<li><span class="selected-item-row no-link">${inner}</span></li>`;
  }
  return `
    <li>
      <a class="selected-item-row" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
        ${inner}
        <span class="selected-item-arrow">↗</span>
      </a>
    </li>`;
}

function methodLabel(method) {
  if (method === "claude") return "Claude로 보냄";
  if (method === "chatgpt") return "ChatGPT로 보냄";
  return null;
}

// entry.intro/insights는 예전(OpenAI로 직접 분석하던 시절) 히스토리에만 있다 — 그 기능은
// 없앴지만 예전 데이터가 남아있을 수 있어 있으면 그대로 보여준다(하위 호환).
function resultHtml(entry) {
  const items = entry.selectedItems || [];
  const ids = items.map((i) => i.id).filter(Boolean);
  const methodBadge = methodLabel(entry.method);
  const hasLegacyResult = entry.intro || (entry.insights && entry.insights.length);
  return `
    <div class="result-meta">
      <span class="result-date">${formatDateTime(entry.createdAt)}</span>
      <span class="result-count">${items.length}개 글</span>
      ${methodBadge ? `<span class="result-method">${escapeHtml(methodBadge)}</span>` : ""}
    </div>
    <ul class="selected-items-list">${items.map(selectedItemRowHtml).join("")}</ul>
    ${ids.length ? `
    <div class="reopen-section">
      <div class="reopen-actions">
        <button class="method-option-inline" data-reopen="chatgpt">ChatGPT로 다시 열기</button>
        <button class="method-option-inline" data-reopen="claude">Claude로 다시 열기</button>
      </div>
      <a class="prompt-link" href="${escapeHtml(promptPageUrl(ids))}" target="_blank" rel="noopener noreferrer">프리필 링크(프롬프트 페이지) 열기 ↗</a>
    </div>` : ""}
    ${hasLegacyResult ? `
    <p class="trend-intro">${escapeHtml(entry.intro || "")}</p>
    <div class="insight-list">${(entry.insights || []).map(insightCardHtml).join("")}</div>` : ""}
  `;
}

function renderCurrent(entry) {
  const container = $("#currentResult");
  if (!entry) {
    container.innerHTML = `
      <div class="empty-state">
        아직 장바구니 히스토리가 없습니다.<br>
        <a href="index.html">카드에서 글을 선택하고 ChatGPT/Claude로 보내보세요 →</a>
      </div>`;
    return;
  }
  container.innerHTML = resultHtml(entry);
}

function historyItemHtml(entry) {
  return `
    <button class="snb-item ${entry.id === activeId ? "active" : ""}" data-id="${entry.id}">
      <span class="snb-item-date">${formatDateTime(entry.createdAt)}</span>
    </button>`;
}

function renderHistoryList() {
  const container = $("#historyList");
  if (historyCache.length === 0) {
    container.innerHTML = `<div class="snb-empty">쌓인 히스토리가 없습니다</div>`;
    return;
  }
  container.innerHTML = historyCache.map(historyItemHtml).join("");
  container.querySelectorAll(".snb-item").forEach((btn) => {
    btn.addEventListener("click", () => selectEntry(btn.dataset.id));
  });
}

function selectEntry(id) {
  activeId = id;
  const entry = historyCache.find((e) => e.id === id) || null;
  renderCurrent(entry);
  document.querySelectorAll(".snb-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.id === id);
  });
  const url = entry ? `trend.html?id=${entry.id}` : "trend.html";
  window.history.pushState({ id }, "", url);
}

async function init() {
  $("#currentResult").innerHTML = `<div class="empty-state"><span class="spinner"></span>불러오는 중...</div>`;
  try {
    historyCache = await apiHistoryList();
  } catch (e) {
    $("#currentResult").innerHTML = `<div class="empty-state">히스토리를 불러오지 못했습니다. 백엔드가 켜져 있는지 확인해주세요.<br>${escapeHtml(e.message)}</div>`;
    $("#historyList").innerHTML = "";
    return;
  }

  const requestedId = idFromQuery();
  activeId = (requestedId && historyCache.some((e) => e.id === requestedId))
    ? requestedId
    : (historyCache[0] ? historyCache[0].id : null);

  renderHistoryList();
  renderCurrent(historyCache.find((e) => e.id === activeId) || null);

  $("#currentResult").addEventListener("click", (e) => {
    const reopenBtn = e.target.closest("[data-reopen]");
    if (!reopenBtn) return;
    const entry = historyCache.find((en) => en.id === activeId);
    const ids = ((entry && entry.selectedItems) || []).map((i) => i.id).filter(Boolean);
    if (ids.length) openHandoff(ids, reopenBtn.dataset.reopen);
  });

  $("#clearHistoryBtn").addEventListener("click", async () => {
    if (historyCache.length === 0) return;
    if (!confirm("저장된 장바구니 히스토리를 모두 지울까요?")) return;
    try {
      await apiHistoryClear();
    } catch (e) {
      showToastFallback(e.message);
      return;
    }
    historyCache = [];
    activeId = null;
    renderHistoryList();
    renderCurrent(null);
    window.history.pushState({}, "", "trend.html");
  });

  window.addEventListener("popstate", () => {
    const id = idFromQuery();
    activeId = id || (historyCache[0] ? historyCache[0].id : null);
    renderCurrent(historyCache.find((e) => e.id === activeId) || null);
    document.querySelectorAll(".snb-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.id === activeId);
    });
  });
}

function showToastFallback(msg) {
  alert(msg);
}

document.addEventListener("DOMContentLoaded", init);
