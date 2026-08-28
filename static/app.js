// 카드 목록 화면 로직. 실제 백엔드(app/main.py)를 호출한다. 공통 로직은 common.js.

const state = {
  items: [],
  activeSource: "all",
  days: 3, // 며칠치를 볼지 — 이미 수집해둔 최근 범위 안에서만 고르므로 아카이브 한계와 무관
  selected: new Set(),
  usedIds: new Set(), // 예전 트렌드 분석에 한 번이라도 포함됐던 글의 id
};

async function loadUsedIds() {
  try {
    state.usedIds = new Set(await apiGetUsedItemIds());
  } catch (e) {
    state.usedIds = new Set(); // 실패해도 카드 목록 자체는 정상 동작해야 하니 조용히 무시
  }
}

function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function filteredItems() {
  if (state.activeSource === "all") return state.items;
  return state.items.filter((i) => i.source === state.activeSource);
}

async function loadItems(refresh = false) {
  const container = $("#cards");
  container.innerHTML = `<div class="empty-state"><span class="spinner"></span>불러오는 중...</div>`;
  try {
    state.items = await apiGetItems("all", refresh, state.days);
  } catch (e) {
    container.innerHTML = `<div class="empty-state">글을 불러오지 못했습니다. 백엔드가 켜져 있는지 확인해주세요.<br>${escapeHtml(e.message)}</div>`;
    return;
  }
  renderCards();
}

function renderCards() {
  const items = filteredItems();
  const container = $("#cards");
  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">이 소스에는 아직 표시할 글이 없습니다.</div>`;
    return;
  }
  container.innerHTML = items.map(cardHtml).join("");
  items.forEach((item) => {
    const btn = $(`#summarize-${item.id}`);
    if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); onSummarize(item.id); });
    $(`#card-${item.id}`).addEventListener("click", (e) => {
      if (e.target.closest(".summarize-btn") || e.target.closest(".card-title")) return;
      onSelect(item.id, !state.selected.has(item.id));
    });
  });
}

function cardHtml(item) {
  const revealed = !!item.summary;
  const selected = state.selected.has(item.id);
  const used = state.usedIds.has(item.id);
  return `
  <div class="card ${selected ? "selected" : ""} ${used ? "used" : ""}" id="card-${item.id}">
    <div class="card-top">
      <div class="card-badges">
        <span class="badge ${item.source}">${escapeHtml(SOURCE_LABEL[item.source] || item.source)}</span>
        ${used ? '<span class="used-badge" title="이전 트렌드 분석에 포함됨">✓ 분석됨</span>' : ""}
      </div>
    </div>
    <a class="card-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
    <div class="card-meta">${escapeHtml(item.meta)}</div>
    <p class="card-excerpt">${escapeHtml(item.excerpt)}</p>
    <div class="card-summary ${revealed ? "show" : ""}" id="summary-${item.id}">
      ${revealed ? summaryInnerHtml(item) : ""}
    </div>
    <div class="card-actions">
      ${revealed ? "" : `<button class="summarize-btn" id="summarize-${item.id}">AI 요약 보기</button>`}
    </div>
  </div>`;
}

function summaryInnerHtml(item) {
  return `
    <ul>${item.summary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    <div class="keywords">${item.keywords.map((k) => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join("")}</div>
  `;
}

function onSelect(id, checked) {
  if (checked) state.selected.add(id);
  else state.selected.delete(id);
  $(`#card-${id}`).classList.toggle("selected", checked);
  updateTrendbar();
}

function updateTrendbar() {
  const n = state.selected.size;
  const countEl = $("#trendCount");
  countEl.textContent = n;
  countEl.classList.toggle("hidden", n === 0);
  $("#trendBtn").disabled = n < 1;
}

// API를 쓰지 않고, 같은 분석 요청을 사용자 본인의 ChatGPT/Claude 계정으로 넘긴다
// (xlmeta의 프리필 링크 패턴과 동일). 결과는 외부 챗에서만 확인 — 우리 앱으로 회수하지 않는다.
// promptPageUrl/handoffMessage/openHandoff는 common.js 공유(장바구니 히스토리에서 "다시
// 열기"할 때도 같은 함수를 씀).
//
// window.open은 반드시 클릭 이벤트 안에서 동기적으로 먼저 불러야 한다 — apiCart 호출을
// await한 뒤에 열면 팝업 차단에 걸릴 수 있어서, 창은 즉시 열고 장바구니 기록은 그 뒤에
// 백그라운드로 보낸다(실패해도 핸드오프 자체엔 영향 없음, 조용히 무시).
function onHandoffOpen(target) {
  const ids = [...state.selected];
  openHandoff(ids, target);
  apiCart(ids, target)
    .then(() => loadUsedIds())
    .then(() => renderCards())
    .catch(() => {});
}

async function onHandoffCopy() {
  try {
    await navigator.clipboard.writeText(handoffMessage([...state.selected]));
    showToast("메시지를 복사했어요. ChatGPT나 Claude에 붙여넣어주세요.");
  } catch (e) {
    showToast(e.message);
  }
}

async function onSummarize(id) {
  const btn = $(`#summarize-${id}`);
  const summaryEl = $(`#summary-${id}`);
  btn.innerHTML = `<span class="spinner"></span>요약 생성 중...`;
  btn.disabled = true;
  try {
    const result = await apiSummarize(id);
    const item = state.items.find((i) => i.id === id);
    item.summary = result.summary;
    item.keywords = result.keywords;
    summaryEl.innerHTML = summaryInnerHtml(item);
    summaryEl.classList.add("show");
    btn.remove();
  } catch (e) {
    btn.textContent = "AI 요약 보기";
    btn.disabled = false;
    showToast(e.message);
  }
}

function onTabClick(e) {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  $("#sourceTabs").querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  state.activeSource = btn.dataset.source;
  renderCards();
}

function onDaysClick(e) {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  $("#daysFilter").querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  state.days = Number(btn.dataset.days);
  loadItems(false);
}

async function onRefresh() {
  await loadUsedIds();
  loadItems(true);
  showToast("새로고침했어요.");
}

// "선택 항목 인사이트 분석" 클릭 → ChatGPT/Claude 중 하나를 고르는 모달을 먼저 띄운다.
function openMethodModal() {
  if (state.selected.size < 1) return;
  $("#methodModalCount").textContent = state.selected.size;
  $("#methodModalOverlay").classList.remove("hidden");
}

function closeMethodModal() {
  $("#methodModalOverlay").classList.add("hidden");
}

function onMethodChatGpt() {
  closeMethodModal();
  onHandoffOpen("chatgpt");
}

function onMethodClaude() {
  closeMethodModal();
  onHandoffOpen("claude");
}

async function init() {
  await loadUsedIds();
  loadItems();
  $("#sourceTabs").addEventListener("click", onTabClick);
  $("#daysFilter").addEventListener("click", onDaysClick);
  $("#refreshBtn").addEventListener("click", onRefresh);
  $("#trendBtn").addEventListener("click", openMethodModal);
  $("#methodModalClose").addEventListener("click", closeMethodModal);
  $("#methodModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "methodModalOverlay") closeMethodModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMethodModal();
  });
  $("#methodChatGptBtn").addEventListener("click", onMethodChatGpt);
  $("#methodClaudeBtn").addEventListener("click", onMethodClaude);
  $("#methodCopyLinkBtn").addEventListener("click", onHandoffCopy);
}

document.addEventListener("DOMContentLoaded", init);
