// 페이지 트렌드 결과 + 히스토리(Obsidian 스타일 SNB) 화면 로직. 실제 백엔드를 호출한다.
// 데이터/인사이트 렌더는 common.js 공유.

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

function resultHtml(entry) {
  const items = entry.selectedItems || [];
  return `
    <div class="result-meta">
      <span class="result-date">${formatDateTime(entry.createdAt)}</span>
      <span class="result-count">${items.length}개 글 선택</span>
    </div>
    <div class="selected-items-section collapsed">
      <button class="selected-items-toggle" type="button">
        <span class="selected-items-label">분석에 사용한 글 <span class="selected-items-count">${items.length}</span></span>
        <span class="selected-items-chevron">▾</span>
      </button>
      <ul class="selected-items-list">${items.map(selectedItemRowHtml).join("")}</ul>
    </div>
    <p class="trend-intro">${escapeHtml(entry.intro)}</p>
    <div class="insight-list">${(entry.insights || []).map(insightCardHtml).join("")}</div>
  `;
}

function renderCurrent(entry) {
  const container = $("#currentResult");
  if (!entry) {
    container.innerHTML = `
      <div class="empty-state">
        아직 분석한 트렌드가 없습니다.<br>
        <a href="index.html">카드에서 글을 선택하고 분석해보세요 →</a>
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
    const toggle = e.target.closest(".selected-items-toggle");
    if (!toggle) return;
    toggle.closest(".selected-items-section").classList.toggle("collapsed");
  });

  $("#clearHistoryBtn").addEventListener("click", async () => {
    if (historyCache.length === 0) return;
    if (!confirm("저장된 트렌드 히스토리를 모두 지울까요?")) return;
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
