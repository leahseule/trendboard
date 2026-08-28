// 카드 목록 화면 로직. 실제 백엔드(app/main.py)를 호출한다. 공통 로직은 common.js.

const state = {
  items: [],
  activeSource: "all",
  selected: new Set(),
  dateRange: null, // null이면 기본(최근 3일). {start, end} 형태로 지정하면 그 기간.
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
    state.items = await apiGetItems("all", refresh, state.dateRange);
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
    const hint = state.dateRange
      ? "선택한 기간에 해당하는 글이 없습니다. RSS는 최근 게시물만 제공해서, 서비스가 그 기간 동안 실제로 수집해둔 글이 없으면 검색되지 않을 수 있어요."
      : "이 소스에는 아직 표시할 글이 없습니다.";
    container.innerHTML = `<div class="empty-state">${hint}</div>`;
    return;
  }
  container.innerHTML = items.map(cardHtml).join("");
  items.forEach((item) => {
    const checkbox = $(`#select-${item.id}`);
    checkbox.addEventListener("change", (e) => onSelect(item.id, e.target.checked));
    const btn = $(`#summarize-${item.id}`);
    if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); onSummarize(item.id); });
    $(`#card-${item.id}`).addEventListener("click", (e) => {
      if (e.target.closest(".select-label") || e.target.closest(".summarize-btn") || e.target.closest(".card-title")) return;
      checkbox.checked = !checkbox.checked;
      onSelect(item.id, checkbox.checked);
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
      <label class="select-label">
        <input type="checkbox" id="select-${item.id}" ${selected ? "checked" : ""}> 트렌드에 포함
      </label>
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
  $("#handoffChatGptBtn").disabled = n < 1;
  $("#handoffClaudeBtn").disabled = n < 1;
  $("#handoffCopyBtn").disabled = n < 1;
}

// API를 쓰지 않고, 같은 분석 요청을 사용자 본인의 ChatGPT/Claude 계정으로 넘긴다
// (xlmeta의 프리필 링크 패턴과 동일). 결과는 외부 챗에서만 확인 — 우리 앱으로 회수하지 않는다.
// 한글 프롬프트 전체를 URL에 실으면 퍼센트 인코딩 때문에 글자당 9배로 불어나 링크가 안 열릴
// 수 있어서, ChatGPT/Claude에는 우리가 호스팅하는 /prompt 페이지로 가는 "짧은 링크"만 준다.
// 실제 원문 링크·전체 본문은 그 페이지 안에 있다 — 항상 링크만 전달하는 방식으로 확정.
function promptPageUrl() {
  const ids = [...state.selected].join(",");
  return `${window.location.origin}/prompt?ids=${encodeURIComponent(ids)}`;
}

function handoffMessage() {
  return `아래 링크 페이지에 있는 글들의 원문 링크와 본문 전체를 참고해서, 페이지에 안내된 방식대로 분석해줘.\n${promptPageUrl()}`;
}

function onHandoffOpen(target) {
  const q = encodeURIComponent(handoffMessage());
  const url = target === "claude" ? `https://claude.ai/new?q=${q}` : `https://chatgpt.com/?q=${q}`;
  window.open(url, "_blank", "noopener");
}

async function onHandoffCopy() {
  try {
    await navigator.clipboard.writeText(handoffMessage());
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
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  state.activeSource = btn.dataset.source;
  renderCards();
}

async function onRefresh() {
  await loadUsedIds();
  loadItems(true);
  showToast("새로고침했어요.");
}

function updateDateStatus() {
  const status = $("#dateStatus");
  const resetBtn = $("#dateResetBtn");
  if (!state.dateRange) {
    status.textContent = "최근 3일 보는 중";
    resetBtn.classList.add("hidden");
    return;
  }
  const { start, end } = state.dateRange;
  status.textContent = `${start || "처음"} ~ ${end || "지금"} 검색 중`;
  resetBtn.classList.remove("hidden");
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function onDateSearch() {
  const start = $("#dateFrom").value || null;
  const end = $("#dateTo").value || null;
  const today = todayStr();

  if (!start && !end) {
    showToast("검색할 날짜를 하나 이상 입력해주세요.");
    return;
  }
  if (start && start > today) {
    showToast("시작일은 오늘보다 미래일 수 없어요.");
    return;
  }
  if (end && end > today) {
    showToast("종료일은 오늘보다 미래일 수 없어요.");
    return;
  }
  if (start && end && start > end) {
    showToast("시작일이 종료일보다 늦을 수 없어요.");
    return;
  }

  state.dateRange = { start, end };
  updateDateStatus();
  loadItems(false);
}

function onDateReset() {
  state.dateRange = null;
  $("#dateFrom").value = "";
  $("#dateTo").value = "";
  updateDateStatus();
  loadItems(false);
}

async function onTrendClick() {
  const btn = $("#trendBtn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>분석 중...`;
  const ids = [...state.selected];
  try {
    const entry = await apiTrend(ids);
    window.location.href = `trend.html?id=${entry.id}`;
  } catch (e) {
    showToast(e.message);
    btn.innerHTML = `<span id="trendCount" class="cart-count hidden">0</span>선택 항목 트렌드 분석`;
    updateTrendbar();
  }
}

async function init() {
  await loadUsedIds();
  loadItems();
  $("#sourceTabs").addEventListener("click", onTabClick);
  $("#refreshBtn").addEventListener("click", onRefresh);
  $("#trendBtn").addEventListener("click", onTrendClick);
  $("#handoffChatGptBtn").addEventListener("click", () => onHandoffOpen("chatgpt"));
  $("#handoffClaudeBtn").addEventListener("click", () => onHandoffOpen("claude"));
  $("#handoffCopyBtn").addEventListener("click", onHandoffCopy);
  $("#dateSearchBtn").addEventListener("click", onDateSearch);
  $("#dateResetBtn").addEventListener("click", onDateReset);

  const today = todayStr();
  $("#dateFrom").max = today;
  $("#dateTo").max = today;
}

document.addEventListener("DOMContentLoaded", init);
