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

function shortDate(iso) {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function updateDateFilterLabel() {
  const label = $("#dateFilterLabel");
  const trigger = $("#dateFilterTrigger");
  if (!state.dateRange) {
    label.textContent = "최근 3일";
    trigger.classList.remove("active");
    return;
  }
  const { start, end } = state.dateRange;
  label.textContent = `${start ? shortDate(start) : "처음"} ~ ${end ? shortDate(end) : "지금"}`;
  trigger.classList.add("active");
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoDate(y, m, d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

// 네이티브 <input type="date">는 클릭했을 때 뜨는 팝업 달력 자체를 CSS로 못 건드려서
// (브라우저/OS가 그리는 UI라 스타일링 불가) "달력이 올드하다"는 피드백을 해결할 수 없었다.
// 그래서 달력 그리드를 직접 그리는 방식으로 바꿈 — 시작일 클릭 → 종료일 클릭 순서로
// 범위를 고르고(Airbnb류 range picker와 동일한 상호작용), 적용을 눌러야 반영된다.
const cal = { viewYear: 0, viewMonth: 0, start: null, end: null };

function initCalFromState() {
  const base = (state.dateRange && state.dateRange.start) || todayStr();
  const [y, m] = base.split("-").map(Number);
  cal.viewYear = y;
  cal.viewMonth = m - 1;
  cal.start = (state.dateRange && state.dateRange.start) || null;
  cal.end = (state.dateRange && state.dateRange.end) || null;
}

function renderCalendar() {
  const { viewYear, viewMonth, start, end } = cal;
  $("#calMonthLabel").textContent = `${viewYear}년 ${viewMonth + 1}월`;

  const today = todayStr();
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ y: viewMonth === 0 ? viewYear - 1 : viewYear, m: viewMonth === 0 ? 11 : viewMonth - 1, d: daysInPrevMonth - i, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y: viewYear, m: viewMonth, d, outside: false });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ y: viewMonth === 11 ? viewYear + 1 : viewYear, m: viewMonth === 11 ? 0 : viewMonth + 1, d: nextDay, outside: true });
    nextDay++;
  }

  $("#calGrid").innerHTML = cells.map((c) => {
    const iso = isoDate(c.y, c.m, c.d);
    const classes = ["cal-day"];
    if (c.outside) classes.push("outside");
    if (iso === today) classes.push("today");
    if (start && iso === start) classes.push("range-start");
    if (end && iso === end) classes.push("range-end");
    if (start && end && iso > start && iso < end) classes.push("in-range");
    const disabled = iso > today;
    return `<button type="button" class="${classes.join(" ")}" data-date="${iso}" ${disabled ? "disabled" : ""}>${c.d}</button>`;
  }).join("");
}

function onCalDayClick(iso) {
  if (!cal.start || (cal.start && cal.end)) {
    cal.start = iso;
    cal.end = null;
  } else if (iso < cal.start) {
    cal.start = iso;
  } else {
    cal.end = iso;
  }
  renderCalendar();
  $("#dateSearchBtn").disabled = !(cal.start && cal.end);
}

function openDateFilterPopover() {
  initCalFromState();
  renderCalendar();
  $("#dateSearchBtn").disabled = !(cal.start && cal.end);
  $("#dateFilter").classList.add("open");
  $("#dateFilterPopover").classList.remove("hidden");
}

function closeDateFilterPopover() {
  $("#dateFilter").classList.remove("open");
  $("#dateFilterPopover").classList.add("hidden");
}

function toggleDateFilterPopover() {
  if ($("#dateFilterPopover").classList.contains("hidden")) openDateFilterPopover();
  else closeDateFilterPopover();
}

function onDateSearch() {
  if (!cal.start || !cal.end) return;
  state.dateRange = { start: cal.start, end: cal.end };
  updateDateFilterLabel();
  closeDateFilterPopover();
  loadItems(false);
}

function onDateReset() {
  state.dateRange = null;
  cal.start = null;
  cal.end = null;
  updateDateFilterLabel();
  closeDateFilterPopover();
  loadItems(false);
}

// "선택 항목 트렌드 분석" 클릭 → ChatGPT/Claude 중 하나를 고르는 모달을 먼저 띄운다.
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
  $("#refreshBtn").addEventListener("click", onRefresh);
  $("#trendBtn").addEventListener("click", openMethodModal);
  $("#methodModalClose").addEventListener("click", closeMethodModal);
  $("#methodModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "methodModalOverlay") closeMethodModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeMethodModal();
    closeDateFilterPopover();
  });
  $("#methodChatGptBtn").addEventListener("click", onMethodChatGpt);
  $("#methodClaudeBtn").addEventListener("click", onMethodClaude);
  $("#methodCopyLinkBtn").addEventListener("click", onHandoffCopy);
  $("#dateFilterTrigger").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDateFilterPopover();
  });
  document.addEventListener("click", (e) => {
    if (!$("#dateFilter").contains(e.target)) closeDateFilterPopover();
  });
  $("#dateFilterPopover").addEventListener("click", (e) => e.stopPropagation());
  $("#dateSearchBtn").addEventListener("click", onDateSearch);
  $("#dateResetBtn").addEventListener("click", onDateReset);
  $("#calPrevBtn").addEventListener("click", () => {
    cal.viewMonth -= 1;
    if (cal.viewMonth < 0) { cal.viewMonth = 11; cal.viewYear -= 1; }
    renderCalendar();
  });
  $("#calNextBtn").addEventListener("click", () => {
    cal.viewMonth += 1;
    if (cal.viewMonth > 11) { cal.viewMonth = 0; cal.viewYear += 1; }
    renderCalendar();
  });
  $("#calGrid").addEventListener("click", (e) => {
    const btn = e.target.closest(".cal-day");
    if (!btn || btn.disabled) return;
    onCalDayClick(btn.dataset.date);
  });
}

document.addEventListener("DOMContentLoaded", init);
