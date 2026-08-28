// 히스토리(Obsidian 스타일 SNB) 화면 로직. ChatGPT/Claude로 보낼 때 어떤 글 조합을
// 보냈는지의 기록이다 — OpenAI 분석 결과 자체는 없다(외부 챗에만 남음), 대신 프리필에
// 담기는 내용(기사 목록 + 프롬프트 전문)을 그 자리에서 다시 만들어 보여준다.
// apiPromptData/openHandoff 등은 common.js 공유("다시 열기"가 app.js의 핸드오프와 동일 로직).

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

function resultHtml(entry) {
  const items = entry.selectedItems || [];
  const ids = items.map((i) => i.id).filter(Boolean);
  const methodBadge = methodLabel(entry.method);
  return `
    <div class="result-meta">
      <span class="result-date">${formatDateTime(entry.createdAt)}</span>
      <span class="result-count">${items.length}개 글</span>
      ${methodBadge ? `<span class="result-method">${escapeHtml(methodBadge)}</span>` : ""}
    </div>
    ${ids.length ? `
    <div class="reopen-section">
      <div class="reopen-actions">
        <button class="method-option-inline" data-reopen="chatgpt">ChatGPT로 다시 열기</button>
        <button class="method-option-inline" data-reopen="claude">Claude로 다시 열기</button>
      </div>
      <div class="prompt-preview-label">
        프리필 링크에 담기는 내용
        <button class="copy-inline-btn" id="copyPromptBtn" disabled>복사하기</button>
      </div>
      <div id="promptPreview" class="prompt-preview"><span class="spinner"></span>불러오는 중...</div>
    </div>` : ""}
    <div class="prompt-preview-label">분석에 사용한 글</div>
    <ul class="selected-items-list">${items.map(selectedItemRowHtml).join("")}</ul>
  `;
}

// /prompt 페이지(ChatGPT/Claude가 여는 그 페이지)와 완전히 같은 내용을 그 자리에서
// 바로 보여준다 — 매번 ids로부터 다시 만들어서 저장 없이도 항상 최신 원문을 반영한다.
async function loadPromptPreview(entry) {
  const ids = (entry.selectedItems || []).map((i) => i.id).filter(Boolean);
  const el = $("#promptPreview");
  if (!el) return;
  let data;
  try {
    data = await apiPromptData(ids);
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
    return;
  }
  el.innerHTML = `<pre class="prompt-text">${escapeHtml(data.promptText)}</pre>`;
  const copyBtn = $("#copyPromptBtn");
  if (copyBtn) {
    copyBtn.disabled = false;
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(data.promptText);
        showToastFallback("프롬프트를 복사했어요.");
      } catch (e) {
        showToastFallback(e.message);
      }
    });
  }
}

function renderCurrent(entry) {
  const container = $("#currentResult");
  if (!entry) {
    container.innerHTML = `
      <div class="empty-state">
        아직 히스토리가 없습니다.<br>
        <a href="index.html">카드에서 글을 선택하고 ChatGPT/Claude로 보내보세요 →</a>
      </div>`;
    return;
  }
  container.innerHTML = resultHtml(entry);
  loadPromptPreview(entry);
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
