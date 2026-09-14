const STATUS_COLUMNS = [
  { key: "TODO", label: "할 일" },
  { key: "IN_PROGRESS", label: "진행 중" },
  { key: "DONE", label: "완료" },
];

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const state = {
  people: [],
  tasks: [],
  helpTasks: [],
  meetings: [],
  filter: "",
  view: "board",
  me: null,
  monthCursor: startOfMonth(new Date()),
  notifPollStarted: false,
};

const els = {
  loginScreen: document.getElementById("login-screen"),
  appScreen: document.getElementById("app-screen"),
  loginForm: document.getElementById("login-form"),
  loginNameSelect: document.getElementById("login-name"),
  passcodeInput: document.getElementById("passcode-input"),
  loginError: document.getElementById("login-error"),
  logoutBtn: document.getElementById("logout-btn"),
  currentUserChip: document.getElementById("current-user-chip"),
  sidebarEl: document.getElementById("sidebar"),
  sidebarPeople: document.getElementById("sidebar-people"),
  mobileMenuBtn: document.getElementById("mobile-menu-btn"),
  sidebarBackdrop: document.getElementById("sidebar-backdrop"),
  tabs: document.querySelectorAll(".tab[data-view]"),
  boardView: document.getElementById("board-view"),
  boardTitle: document.getElementById("board-title"),
  calendarView: document.getElementById("calendar-view"),
  helpView: document.getElementById("help-view"),
  helpColumns: document.getElementById("help-columns"),
  announcementsView: document.getElementById("announcements-view"),
  boardColumns: document.getElementById("board-columns"),
  calendarMonthGrid: document.getElementById("calendar-month-grid"),
  calendarRangeLabel: document.getElementById("calendar-range-label"),
  calendarPrevBtn: document.getElementById("calendar-prev"),
  calendarNextBtn: document.getElementById("calendar-next"),
  calendarTodayBtn: document.getElementById("calendar-today-btn"),
  newMeetingBtn: document.getElementById("new-meeting-btn"),
  newMeetingModal: document.getElementById("new-meeting-modal"),
  newMeetingForm: document.getElementById("new-meeting-form"),
  announcementsList: document.getElementById("announcements-list"),
  announcementForm: document.getElementById("announcement-form"),
  announcementSubject: document.getElementById("announcement-subject"),
  announcementMessage: document.getElementById("announcement-message"),
  announcementAvatarSlot: document.getElementById("announcement-avatar-slot"),
  announcementAuthorName: document.getElementById("announcement-author-name"),
  newTaskBtn: document.getElementById("new-task-btn"),
  newTaskModal: document.getElementById("new-task-modal"),
  newTaskForm: document.getElementById("new-task-form"),
  newTaskAssignees: document.getElementById("new-task-assignees"),
  newTaskStatus: document.getElementById("new-task-status"),
  newTaskHelpToggle: document.getElementById("new-task-help-toggle"),
  taskModal: document.getElementById("task-modal"),
  taskModalBody: document.getElementById("task-modal-body"),
  notifBellBtn: document.getElementById("notif-bell-btn"),
  notifBadge: document.getElementById("notif-badge"),
  notifPanel: document.getElementById("notif-panel"),
  notifList: document.getElementById("notif-list"),
  fundsBarFill: document.getElementById("funds-bar-fill"),
  fundsCurrent: document.getElementById("funds-current"),
  fundsGoalEl: document.getElementById("funds-goal"),
  addFundsBtn: document.getElementById("add-funds-btn"),
  fundsModal: document.getElementById("funds-modal"),
  fundsForm: document.getElementById("funds-form"),
  boardSubtitle: document.getElementById("board-subtitle"),
  announceNavBadge: document.getElementById("announce-nav-badge"),
  helpNavBadge: document.getElementById("help-nav-badge"),
  sidebarPeopleCount: document.getElementById("sidebar-people-count"),
  sidebarAllCount: document.getElementById("sidebar-all-count"),
  sidebarUnassignedCount: document.getElementById("sidebar-unassigned-count"),
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error("로그인이 필요합니다.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `요청에 실패했습니다 (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function showLogin() {
  els.loginScreen.hidden = false;
  els.appScreen.hidden = true;
}

function showApp() {
  els.loginScreen.hidden = true;
  els.appScreen.hidden = false;
}

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString + "Z").getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(isoString + "Z").toLocaleDateString("ko-KR");
}

function daysUntil(dueDateStr) {
  const due = new Date(`${dueDateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

function dueDatePill(task) {
  if (task.status === "DONE") return { label: "완료", cls: "due-done" };
  if (!task.due_date) return null;
  const days = daysUntil(task.due_date);
  if (days < 0) return { label: `${Math.abs(days)}일 지남`, cls: "due-overdue" };
  if (days === 0) return { label: "오늘 마감", cls: "due-overdue" };
  if (days === 1) return { label: "내일 마감", cls: "due-soon" };
  if (days === 2) return { label: "D-2", cls: "due-soon" };
  return { label: formatDateDot(task.due_date), cls: "due-neutral" };
}

function formatDateDot(isoDate) {
  return isoDate.replaceAll("-", ".");
}

function taskCode(task) {
  return `DOHT-${task.id}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffToMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMonthYear(date) {
  return date.toLocaleDateString("ko-KR", { month: "long", year: "numeric" });
}

function formatTime(time) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "오후" : "오전";
  const hour12 = ((h + 11) % 12) + 1;
  return `${period} ${hour12}:${String(m).padStart(2, "0")}`;
}

function formatManwon(n) {
  return `${Number(n).toLocaleString("ko-KR")}만원`;
}

function personOptionsHtml(selected) {
  return state.people
    .map(
      (p) =>
        `<option value="${escapeHtml(p.name)}" ${
          p.name === selected ? "selected" : ""
        }>${escapeHtml(p.name)}</option>`
    )
    .join("");
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const AVATAR_SILHOUETTE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="9" r="4.2"/><path d="M3.5 21c.7-4.8 4.3-7.5 8.5-7.5s7.8 2.7 8.5 7.5Z"/></svg>`;

function avatarHtml(name, size) {
  if (!name) return "";
  const style = size ? `width:${size}px;height:${size}px;` : "";
  return `<span class="avatar" style="${style}" title="${escapeHtml(
    name
  )}">${AVATAR_SILHOUETTE_SVG}</span>`;
}

function avatarStackHtml(names, max = 3) {
  if (!names || !names.length) return "";
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return `<div class="avatar-stack">${shown
    .map((n) => avatarHtml(n, 18))
    .join("")}${extra > 0 ? `<span class="avatar-stack-more">+${extra}</span>` : ""}</div>`;
}

function assigneeSummaryLabel(names) {
  if (!names || !names.length) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}명`;
}

function assigneePickerHtml(selectedNames) {
  const selected = new Set(selectedNames || []);
  return state.people
    .map(
      (p) => `
    <button type="button" class="assignee-option ${
      selected.has(p.name) ? "selected" : ""
    }" data-name="${escapeHtml(p.name)}">
      ${avatarHtml(p.name, 16)}<span>${escapeHtml(p.name)}</span>
    </button>
  `
    )
    .join("");
}

function getSelectedAssignees(container) {
  return [...container.querySelectorAll(".assignee-option.selected")].map(
    (btn) => btn.dataset.name
  );
}

function bindAssigneePicker(container) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".assignee-option");
    if (!btn) return;
    btn.classList.toggle("selected");
  });
}

/* ---------- @mentions (typed in any comment, no separate ping button) ---------- */

function renderMentionsHtml(message) {
  let result = escapeHtml(message);
  const names = [...state.people].sort((a, b) => b.name.length - a.name.length);
  for (const p of names) {
    const token = "@" + escapeHtml(p.name);
    result = result.split(token).join(`<span class="mention">${token}</span>`);
  }
  return result;
}

function currentMentionQuery(inputEl) {
  const pos = inputEl.selectionStart;
  const upToCursor = inputEl.value.slice(0, pos);
  const match = upToCursor.match(/@([^\s@]*)$/);
  return match ? match[1] : null;
}

function insertMention(inputEl, name) {
  const pos = inputEl.selectionStart;
  const upToCursor = inputEl.value.slice(0, pos);
  const match = upToCursor.match(/@([^\s@]*)$/);
  if (!match) return;
  const start = pos - match[0].length;
  const before = inputEl.value.slice(0, start);
  const after = inputEl.value.slice(pos);
  const insertion = `@${name} `;
  inputEl.value = before + insertion + after;
  const newPos = (before + insertion).length;
  inputEl.focus();
  inputEl.setSelectionRange(newPos, newPos);
}

function attachMentionAutocomplete(inputEl) {
  if (!inputEl) return;
  let dropdown = null;

  function closeDropdown() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  }

  function updateDropdown() {
    const query = currentMentionQuery(inputEl);
    if (query === null) {
      closeDropdown();
      return;
    }
    const matches = state.people
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 6);
    if (!matches.length) {
      closeDropdown();
      return;
    }
    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.className = "mention-dropdown";
      inputEl.parentElement.appendChild(dropdown);
    }
    dropdown.innerHTML = matches
      .map(
        (p) => `
      <button type="button" class="mention-option" data-name="${escapeHtml(p.name)}">
        ${avatarHtml(p.name, 18)}<span>${escapeHtml(p.name)}</span>
      </button>
    `
      )
      .join("");
    dropdown.querySelectorAll(".mention-option").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        insertMention(inputEl, btn.dataset.name);
        closeDropdown();
      });
    });
  }

  inputEl.addEventListener("input", updateDropdown);
  inputEl.addEventListener("blur", () => setTimeout(closeDropdown, 150));
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDropdown();
  });
}

async function init() {
  state.people = await api("/api/people");
  els.loginNameSelect.innerHTML =
    `<option value="">누구세요?</option>` + personOptionsHtml(null);
  renderSidebar();

  els.loginForm.addEventListener("submit", onLoginSubmit);
  els.logoutBtn.addEventListener("click", onLogout);
  els.tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      switchView(tab.dataset.view);
      closeMobileSidebar();
    })
  );
  els.newTaskBtn.addEventListener("click", () => openNewTaskModal("TODO"));
  els.newTaskForm.addEventListener("submit", onCreateTask);
  els.announcementForm.addEventListener("submit", onPostAnnouncement);
  attachMentionAutocomplete(els.announcementMessage);
  els.newMeetingBtn.addEventListener("click", () => openModal(els.newMeetingModal));
  els.newMeetingForm.addEventListener("submit", onCreateMeeting);
  els.calendarPrevBtn.addEventListener("click", () => navigateCalendar(-1));
  els.calendarNextBtn.addEventListener("click", () => navigateCalendar(1));
  els.calendarTodayBtn.addEventListener("click", () => {
    state.monthCursor = startOfMonth(new Date());
    renderCalendar();
  });
  els.newTaskHelpToggle.addEventListener("click", () => {
    els.newTaskHelpToggle.classList.toggle("selected");
  });
  els.addFundsBtn.addEventListener("click", () => openFundsModal());
  els.fundsForm.addEventListener("submit", onSubmitFunds);
  els.notifBellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNotifPanel();
  });
  document.addEventListener("click", (e) => {
    if (
      !els.notifPanel.hidden &&
      !e.target.closest(".notif-wrap") &&
      !e.target.closest("#notif-panel")
    ) {
      closeNotifPanel();
    }
  });
  els.mobileMenuBtn.addEventListener("click", () => openMobileSidebar());
  els.sidebarBackdrop.addEventListener("click", () => closeMobileSidebar());

  const allModals = [els.newTaskModal, els.taskModal, els.newMeetingModal, els.fundsModal];
  document.querySelectorAll("[data-close-modal]").forEach((btn) =>
    btn.addEventListener("click", () => closeModal(btn.closest(".modal-overlay")))
  );
  allModals.forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  const session = await api("/api/auth/session");
  if (session.loggedIn) {
    state.me = session.name;
    showApp();
    await bootstrap();
  } else {
    showLogin();
  }
}

async function onLoginSubmit(e) {
  e.preventDefault();
  els.loginError.hidden = true;
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        passcode: els.passcodeInput.value,
        name: els.loginNameSelect.value,
      }),
    });
    state.me = result.name;
    els.passcodeInput.value = "";
    showApp();
    await bootstrap();
  } catch (err) {
    els.loginError.textContent = err.message;
    els.loginError.hidden = false;
  }
}

async function onLogout() {
  await api("/api/auth/logout", { method: "POST" });
  state.me = null;
  showLogin();
}

async function bootstrap() {
  els.newTaskAssignees.innerHTML = assigneePickerHtml([]);
  bindAssigneePicker(els.newTaskAssignees);
  els.sidebarPeopleCount.textContent = String(state.people.length).padStart(2, "0");
  updateCurrentUserDisplays();
  await refreshNotifBadge();
  await refreshAnnouncementBadge();
  if (!state.notifPollStarted) {
    state.notifPollStarted = true;
    setInterval(() => {
      refreshNotifBadge();
      refreshAnnouncementBadge();
    }, 30000);
  }
  await loadTasks();
  await loadFunds();
}

async function refreshAnnouncementBadge() {
  try {
    const { count } = await api("/api/notifications/unread-count?type=announcement");
    els.announceNavBadge.textContent = String(count);
    els.announceNavBadge.hidden = count === 0;
  } catch (err) {
    // 일시적 오류이거나 로그아웃 상태 — 다음 폴링에서 다시 시도
  }
}

function updateCurrentUserDisplays() {
  els.announcementAvatarSlot.innerHTML = avatarHtml(state.me, 34);
  els.announcementAuthorName.textContent = state.me || "";
  els.currentUserChip.innerHTML = `${avatarHtml(state.me, 26)}<span>${escapeHtml(
    state.me || ""
  )}</span>`;
}

/* ---------- Mobile sidebar drawer ---------- */

function openMobileSidebar() {
  els.sidebarEl.classList.add("open");
  els.sidebarBackdrop.hidden = false;
}

function closeMobileSidebar() {
  els.sidebarEl.classList.remove("open");
  els.sidebarBackdrop.hidden = true;
}

/* ---------- Sidebar (person filter) ---------- */

function renderSidebar() {
  const peopleHtml = state.people
    .map(
      (p) => `
    <button type="button" class="sidebar-person" data-value="${escapeHtml(p.name)}">
      ${avatarHtml(p.name, 18)}${escapeHtml(p.name)}
      <span class="sidebar-person-count">0</span>
    </button>
  `
    )
    .join("");
  els.sidebarPeople.insertAdjacentHTML("beforeend", peopleHtml);
  els.sidebarPeople.querySelectorAll(".sidebar-person").forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.value));
  });
}

function setFilter(value) {
  state.filter = value;
  els.sidebarPeople.querySelectorAll(".sidebar-person").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
  updateBoardTitle();
  switchView("board");
  loadTasks();
  closeMobileSidebar();
}

function updateBoardTitle() {
  let title = "전체 보드";
  if (state.filter === "__unassigned__") title = "담당자 없음 업무";
  else if (state.filter) title = `${state.filter}님의 업무`;
  els.boardTitle.textContent = title;
}

function isUrgentPill(pill) {
  return Boolean(pill) && (pill.cls === "due-overdue" || pill.cls === "due-soon");
}

function updateBoardSubtitle() {
  const open = state.tasks.filter((t) => t.status !== "DONE");
  const urgent = open.filter((t) => isUrgentPill(dueDatePill(t)));
  els.boardSubtitle.textContent = `${open.length}건 진행 중 · ${urgent.length}건 임박`;
}

async function refreshSidebarCounts() {
  const allTasks = await api("/api/tasks");
  const openTasks = allTasks.filter((t) => t.status !== "DONE");
  els.sidebarAllCount.textContent = openTasks.length;
  els.sidebarUnassignedCount.textContent = openTasks.filter(
    (t) => !t.assignees.length
  ).length;
  const counts = {};
  openTasks.forEach((t) => {
    t.assignees.forEach((name) => {
      counts[name] = (counts[name] || 0) + 1;
    });
  });
  els.sidebarPeople.querySelectorAll(".sidebar-person[data-value]").forEach((btn) => {
    const val = btn.dataset.value;
    if (val === "" || val === "__unassigned__") return;
    const countEl = btn.querySelector(".sidebar-person-count");
    if (countEl) countEl.textContent = counts[val] || 0;
  });

  const helpCount = openTasks.filter((t) => t.needs_help).length;
  els.helpNavBadge.textContent = String(helpCount);
  els.helpNavBadge.hidden = helpCount === 0;
}

function switchView(view) {
  state.view = view;
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  els.boardView.hidden = view !== "board";
  els.calendarView.hidden = view !== "calendar";
  els.helpView.hidden = view !== "help";
  els.announcementsView.hidden = view !== "announcements";
  if (view === "announcements") loadAnnouncements();
  if (view === "calendar") loadCalendar();
  if (view === "help") loadHelpTasks();
}

async function loadTasks() {
  const query = state.filter ? `?assignee=${encodeURIComponent(state.filter)}` : "";
  state.tasks = await api(`/api/tasks${query}`);
  renderBoard();
  updateBoardSubtitle();
  await refreshSidebarCounts();
}

// A task mutation (create/edit/delete) needs to refresh the board it just
// happened on, but if the 도와주세요 tab is the one currently open, its own
// task list (a different filter — needs_help=1 regardless of assignee)
// needs a separate refresh too, since loadTasks() alone doesn't touch it.
async function refreshTaskLists() {
  await loadTasks();
  if (state.view === "help") await loadHelpTasks();
}

async function loadHelpTasks() {
  state.helpTasks = await api("/api/tasks?needs_help=1");
  els.helpColumns.innerHTML = boardColumnsHtml(state.helpTasks);
  attachBoardListeners(els.helpColumns, { presetNeedsHelp: true });
}

function boardColumnsHtml(tasks) {
  return STATUS_COLUMNS.map(({ key, label }) => {
    const columnTasks = tasks.filter((t) => t.status === key);
    const cards = columnTasks.length
      ? columnTasks.map(cardHtml).join("")
      : `<div class="empty-column">아직 작업이 없습니다</div>`;
    return `
      <div class="column" data-status="${key}">
        <div class="column-header">
          <span class="column-dot"></span>
          <h2>${label}</h2>
          <span class="column-count">${String(columnTasks.length).padStart(2, "0")}</span>
        </div>
        <div class="column-body">
          ${cards}
        </div>
        <button type="button" class="add-card-btn" data-status="${key}">+ 카드 추가</button>
      </div>
    `;
  }).join("");
}

function attachBoardListeners(container, { presetNeedsHelp = false } = {}) {
  container.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => openTask(Number(card.dataset.id)));
  });
  container.querySelectorAll(".add-card-btn").forEach((btn) => {
    btn.addEventListener("click", () => openNewTaskModal(btn.dataset.status, presetNeedsHelp));
  });
}

function renderBoard() {
  els.boardColumns.innerHTML = boardColumnsHtml(state.tasks);
  attachBoardListeners(els.boardColumns);
}

function openNewTaskModal(presetStatus, presetNeedsHelp = false) {
  els.newTaskStatus.value = presetStatus;
  const presetAssignee =
    state.filter && state.filter !== "__unassigned__" ? [state.filter] : [];
  els.newTaskAssignees.innerHTML = assigneePickerHtml(presetAssignee);
  els.newTaskHelpToggle.classList.toggle("selected", presetNeedsHelp);
  openModal(els.newTaskModal);
  document.getElementById("new-task-name").focus();
}

/* ---------- Calendar (month view only) ---------- */

async function loadCalendar() {
  state.meetings = await api("/api/meetings");
  renderCalendar();
}

function navigateCalendar(direction) {
  state.monthCursor.setMonth(state.monthCursor.getMonth() + direction);
  renderCalendar();
}

function renderCalendar() {
  const year = state.monthCursor.getFullYear();
  const month = state.monthCursor.getMonth();
  const lastOfMonth = new Date(year, month + 1, 0);
  const firstCell = startOfWeek(new Date(year, month, 1));

  const cells = [];
  const cursor = new Date(firstCell);
  do {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  } while (cells.length % 7 !== 0 || cursor <= lastOfMonth);

  els.calendarRangeLabel.textContent = formatMonthYear(state.monthCursor);

  const todayIso = formatDateISO(new Date());
  const weekdayHeaderHtml = WEEKDAY_LABELS.map(
    (label) => `<div class="calendar-weekday-label">${label}</div>`
  ).join("");

  const cellsHtml = cells
    .map((date) => {
      const inMonth = date.getMonth() === month;
      const isToday = formatDateISO(date) === todayIso;
      return `
        <div class="calendar-month-day ${inMonth ? "" : "calendar-month-day-outside"} ${
        isToday ? "calendar-day-today" : ""
      }">
          <div class="calendar-month-day-number">${date.getDate()}</div>
          <div class="calendar-month-day-body">
            ${dayScheduleHtml(date)}
          </div>
        </div>
      `;
    })
    .join("");

  els.calendarMonthGrid.innerHTML = weekdayHeaderHtml + cellsHtml;
  wireCalendarCellEvents(els.calendarMonthGrid);
}

function dayScheduleHtml(date) {
  const iso = formatDateISO(date);
  const dow = date.getDay();
  const dayMeetings = state.meetings
    .filter((m) => m.day_of_week === dow)
    .sort((a, b) => a.time.localeCompare(b.time));
  const dayTasks = state.tasks.filter((t) => t.due_date === iso);

  const meetingsHtml = dayMeetings
    .map(
      (m) => `
    <div class="calendar-meeting">
      <span class="calendar-meeting-time">${formatTime(m.time)}</span>
      <span class="calendar-meeting-title" title="${escapeHtml(m.title)}">${escapeHtml(
        m.title
      )}</span>
      <button
        type="button"
        class="item-delete-btn calendar-item-delete"
        title="미팅 삭제"
        data-delete-meeting="${m.id}"
      >&times;</button>
    </div>
  `
    )
    .join("");

  const tasksHtml = dayTasks
    .map(
      (t) => `
    <div class="calendar-task" data-task-id="${t.id}" title="${escapeHtml(t.name)}">${escapeHtml(
        t.name
      )}</div>
  `
    )
    .join("");

  return meetingsHtml + tasksHtml;
}

function wireCalendarCellEvents(container) {
  container.querySelectorAll(".calendar-task").forEach((el) => {
    el.addEventListener("click", () => openTask(Number(el.dataset.taskId)));
  });
  container.querySelectorAll("[data-delete-meeting]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteMeeting(Number(btn.dataset.deleteMeeting));
    });
  });
}

async function onCreateMeeting(e) {
  e.preventDefault();
  const body = {
    title: document.getElementById("new-meeting-title").value,
    day_of_week: document.getElementById("new-meeting-day").value,
    time: document.getElementById("new-meeting-time").value,
  };
  await api("/api/meetings", { method: "POST", body: JSON.stringify(body) });
  els.newMeetingForm.reset();
  closeModal(els.newMeetingModal);
  await loadCalendar();
}

async function deleteMeeting(id) {
  if (!confirm("이 주간 미팅을 삭제할까요?")) return;
  await api(`/api/meetings/${id}`, { method: "DELETE" });
  await loadCalendar();
}

/* ---------- Board / tasks ---------- */

function cardHtml(task) {
  const pill = dueDatePill(task);
  return `
    <div class="card" data-id="${task.id}">
      <div class="card-top">
        <span class="card-code">${taskCode(task)}</span>
        ${task.needs_help ? `<span class="help-pill">도움 요청</span>` : ""}
        ${pill ? `<span class="due-pill ${pill.cls}">${pill.label}</span>` : ""}
      </div>
      <div class="card-name">${escapeHtml(task.name)}</div>
      ${
        task.assignees.length
          ? `<div class="card-assignee">${avatarStackHtml(
              task.assignees
            )}<span>${escapeHtml(assigneeSummaryLabel(task.assignees))}</span></div>`
          : ""
      }
    </div>
  `;
}

async function onCreateTask(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById("new-task-name").value,
    assignees: getSelectedAssignees(els.newTaskAssignees),
    due_date: document.getElementById("new-task-due").value,
    notes: document.getElementById("new-task-notes").value,
    status: document.getElementById("new-task-status").value,
    needs_help: els.newTaskHelpToggle.classList.contains("selected"),
  };
  await api("/api/tasks", { method: "POST", body: JSON.stringify(body) });
  els.newTaskForm.reset();
  els.newTaskAssignees.innerHTML = assigneePickerHtml([]);
  els.newTaskHelpToggle.classList.remove("selected");
  closeModal(els.newTaskModal);
  await refreshTaskLists();
}

async function openTask(taskId) {
  const task = await api(`/api/tasks/${taskId}`);
  const comments = await api(`/api/tasks/${taskId}/comments`);
  renderTaskModal(task, comments);
  openModal(els.taskModal);
}

function renderTaskModal(task, comments) {
  const statusInfo = STATUS_COLUMNS.find((s) => s.key === task.status);
  els.taskModalBody.innerHTML = `
    <div class="task-modal-topbar">
      <span class="card-code">${taskCode(task)}</span>
      <span class="status-pill status-pill-${task.status.toLowerCase()}">${statusInfo.label}</span>
    </div>
    <label class="task-name-label">작업 이름
      <input type="text" id="edit-name" value="${escapeHtml(task.name)}" class="task-name-input" />
    </label>
    <label>담당자
      <div class="assignee-picker" id="edit-assignees">${assigneePickerHtml(
        task.assignees
      )}</div>
    </label>
    <div class="task-meta-grid">
      <label>마감일
        <input type="date" id="edit-due" value="${task.due_date || ""}" />
      </label>
      <label>상태
        <div class="status-segmented">
          ${STATUS_COLUMNS.map(
            ({ key, label }) =>
              `<button type="button" class="status-segment ${
                key === task.status ? "active" : ""
              }" data-status="${key}">${label}</button>`
          ).join("")}
        </div>
      </label>
    </div>
    <label>메모
      <textarea id="edit-notes" rows="3">${escapeHtml(task.notes || "")}</textarea>
    </label>
    <div class="modal-actions">
      <button type="button" id="edit-needs-help-toggle" class="help-toggle ${
        task.needs_help ? "selected" : ""
      }">
        <svg class="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6.2"/><path d="M6.1 6.3a1.9 1.9 0 1 1 2.7 1.7c-.5.3-.8.7-.8 1.3v.2"/><circle cx="8" cy="11.3" r="0.15" fill="currentColor" stroke="none"/></svg>
        도움이 필요해요
      </button>
      <button type="button" id="delete-task-btn" class="ghost">작업 삭제</button>
    </div>
    <div class="comments-section">
      <h3>댓글 · ${comments.length}</h3>
      <div class="comments-list">
        ${
          comments.length
            ? comments.map((c) => commentItemHtml(task.id, task.name, c)).join("")
            : `<p class="comments-empty">아직 댓글이 없습니다.</p>`
        }
      </div>
      <form id="comment-form" class="composer composer-compact">
        <div class="composer-header">
          ${avatarHtml(state.me, 28)}
          <span class="composer-author-name">${escapeHtml(state.me || "")}</span>
        </div>
        <textarea
          id="comment-message"
          class="composer-textarea"
          rows="2"
          placeholder="댓글을 입력하세요... (@이름으로 멘션하면 알림이 갑니다)"
          required
        ></textarea>
        <div class="composer-actions">
          <button type="submit" class="btn-primary">댓글 남기기</button>
        </div>
      </form>
    </div>
  `;

  const fieldIds = ["edit-name", "edit-due", "edit-notes"];
  fieldIds.forEach((id) => {
    document.getElementById(id).addEventListener("change", () => saveTaskField(task.id));
  });

  document.getElementById("edit-needs-help-toggle").addEventListener("click", (e) => {
    e.currentTarget.classList.toggle("selected");
    saveTaskField(task.id);
  });

  const editAssignees = document.getElementById("edit-assignees");
  bindAssigneePicker(editAssignees);
  editAssignees.addEventListener("click", (e) => {
    if (e.target.closest(".assignee-option")) saveTaskField(task.id);
  });

  els.taskModalBody.querySelectorAll(".status-segment").forEach((btn) => {
    btn.addEventListener("click", () => {
      els.taskModalBody
        .querySelectorAll(".status-segment")
        .forEach((b) => b.classList.toggle("active", b === btn));
      saveTaskField(task.id);
    });
  });

  document.getElementById("delete-task-btn").addEventListener("click", () => deleteTask(task.id));

  document.getElementById("comment-form").addEventListener("submit", (e) => {
    e.preventDefault();
    postComment(task.id);
  });
  attachMentionAutocomplete(document.getElementById("comment-message"));

  els.taskModalBody.querySelectorAll("[data-delete-comment]").forEach((btn) => {
    btn.addEventListener("click", () =>
      deleteComment(task.id, Number(btn.dataset.deleteComment))
    );
  });
}

function commentItemHtml(taskId, taskName, comment) {
  return `
    <div class="comment-item">
      ${avatarHtml(comment.author, 26)}
      <div class="comment-item-body">
        <div class="comment-item-header">
          <strong>${escapeHtml(comment.author)}</strong>
          <span>${timeAgo(comment.created_at)}</span>
        </div>
        <div class="comment-item-message">${renderMentionsHtml(comment.message)}</div>
      </div>
      <div class="comment-item-actions">
        <button
          type="button"
          class="item-delete-btn"
          title="댓글 삭제"
          data-delete-comment="${comment.id}"
        >&times;</button>
      </div>
    </div>
  `;
}

async function refreshTaskModal(taskId) {
  const task = await api(`/api/tasks/${taskId}`);
  const comments = await api(`/api/tasks/${taskId}/comments`);
  renderTaskModal(task, comments);
}

async function postComment(taskId) {
  const message = document.getElementById("comment-message").value;
  if (!message.trim()) return;
  await api(`/api/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  await refreshTaskModal(taskId);
}

async function deleteComment(taskId, commentId) {
  if (!confirm("댓글을 삭제할까요?")) return;
  await api(`/api/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" });
  await refreshTaskModal(taskId);
}

async function saveTaskField(taskId) {
  const activeSegment = els.taskModalBody.querySelector(".status-segment.active");
  const body = {
    name: document.getElementById("edit-name").value,
    assignees: getSelectedAssignees(document.getElementById("edit-assignees")),
    due_date: document.getElementById("edit-due").value,
    notes: document.getElementById("edit-notes").value,
    status: activeSegment.dataset.status,
    needs_help: document.getElementById("edit-needs-help-toggle").classList.contains("selected"),
  };
  await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(body) });
  await refreshTaskLists();
}

async function deleteTask(taskId) {
  if (!confirm("이 작업과 댓글을 모두 삭제할까요?")) return;
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });
  closeModal(els.taskModal);
  await refreshTaskLists();
}

/* ---------- Announcements ---------- */

async function onPostAnnouncement(e) {
  e.preventDefault();
  const subject = els.announcementSubject.value;
  const message = els.announcementMessage.value;
  if (!subject.trim() || !message.trim()) return;
  await api("/api/announcements", {
    method: "POST",
    body: JSON.stringify({ subject, message }),
  });
  els.announcementSubject.value = "";
  els.announcementMessage.value = "";
  await loadAnnouncements();
}

async function loadAnnouncements() {
  const announcements = await api("/api/announcements");
  const withComments = await Promise.all(
    announcements.map(async (a) => ({
      ...a,
      comments: await api(`/api/announcements/${a.id}/comments`),
    }))
  );

  els.announcementsList.innerHTML = withComments.length
    ? withComments.map(announcementItemHtml).join("")
    : `<div class="empty-state">아직 공지사항이 없습니다.</div>`;

  els.announcementsList.querySelectorAll("[data-delete-announcement]").forEach((btn) => {
    btn.addEventListener("click", () =>
      deleteAnnouncement(Number(btn.dataset.deleteAnnouncement))
    );
  });
  els.announcementsList.querySelectorAll("[data-delete-announcement-comment]").forEach((btn) => {
    btn.addEventListener("click", () =>
      deleteAnnouncementComment(
        Number(btn.dataset.announcementId),
        Number(btn.dataset.deleteAnnouncementComment)
      )
    );
  });
  els.announcementsList.querySelectorAll(".announcement-comment-form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      postAnnouncementComment(Number(form.dataset.announcementId), form);
    });
    attachMentionAutocomplete(form.querySelector(".announcement-comment-message"));
  });
}

function announcementItemHtml(a) {
  const comments = a.comments || [];
  return `
    <div class="announcement-item">
      ${avatarHtml(a.author, 34)}
      <div class="announcement-item-body">
        <div class="announcement-item-header">
          <strong>${escapeHtml(a.author)}</strong>
          <span>${timeAgo(a.created_at)}</span>
        </div>
        <div class="announcement-item-subject">${escapeHtml(a.subject)}</div>
        <div class="announcement-item-message">${renderMentionsHtml(a.message)}</div>
        <div class="announcement-comments">
          ${comments
            .map(
              (c) => `
            <div class="comment-item">
              ${avatarHtml(c.author, 22)}
              <div class="comment-item-body">
                <div class="comment-item-header">
                  <strong>${escapeHtml(c.author)}</strong>
                  <span>${timeAgo(c.created_at)}</span>
                </div>
                <div class="comment-item-message">${renderMentionsHtml(c.message)}</div>
              </div>
              <div class="comment-item-actions">
                <button
                  type="button"
                  class="item-delete-btn"
                  title="댓글 삭제"
                  data-announcement-id="${a.id}"
                  data-delete-announcement-comment="${c.id}"
                >&times;</button>
              </div>
            </div>
          `
            )
            .join("")}
          <form class="announcement-comment-form" data-announcement-id="${a.id}">
            ${avatarHtml(state.me, 22)}
            <input type="text" class="announcement-comment-message" placeholder="답글 달기... (@이름 멘션 가능)" required />
            <button type="submit" class="btn-ghost">답글</button>
          </form>
        </div>
      </div>
      <button
        type="button"
        class="item-delete-btn"
        title="공지사항 삭제"
        data-delete-announcement="${a.id}"
      >&times;</button>
    </div>
  `;
}

async function postAnnouncementComment(announcementId, form) {
  const message = form.querySelector(".announcement-comment-message").value;
  if (!message.trim()) return;
  await api(`/api/announcements/${announcementId}/comments`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  await loadAnnouncements();
}

async function deleteAnnouncementComment(announcementId, commentId) {
  if (!confirm("댓글을 삭제할까요?")) return;
  await api(`/api/announcements/${announcementId}/comments/${commentId}`, {
    method: "DELETE",
  });
  await loadAnnouncements();
}

async function deleteAnnouncement(id) {
  if (!confirm("이 공지사항을 삭제할까요?")) return;
  await api(`/api/announcements/${id}`, { method: "DELETE" });
  await loadAnnouncements();
}

/* ---------- Notifications ---------- */

async function refreshNotifBadge() {
  try {
    const { count } = await api("/api/notifications/unread-count");
    els.notifBadge.textContent = String(count);
    els.notifBadge.hidden = count === 0;
  } catch (err) {
    // 일시적 오류이거나 로그아웃 상태 — 다음 폴링에서 다시 시도
  }
}

function positionNotifPanel() {
  const rect = els.notifBellBtn.getBoundingClientRect();
  els.notifPanel.style.left = `${Math.round(rect.left)}px`;
  els.notifPanel.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
}

function toggleNotifPanel() {
  const opening = els.notifPanel.hidden;
  if (opening) {
    positionNotifPanel();
    els.notifPanel.hidden = false;
    loadNotifications();
  } else {
    els.notifPanel.hidden = true;
  }
}

function closeNotifPanel() {
  els.notifPanel.hidden = true;
}

async function loadNotifications() {
  const notifications = await api("/api/notifications");
  els.notifList.innerHTML = notifications.length
    ? notifications.map(notifItemHtml).join("")
    : `<div class="empty-state">아직 알림이 없습니다.</div>`;

  els.notifList.querySelectorAll("[data-notif-task-id]").forEach((el) => {
    el.addEventListener("click", () => {
      closeNotifPanel();
      openTask(Number(el.dataset.notifTaskId));
    });
  });
  els.notifList.querySelectorAll("[data-notif-announcement]").forEach((el) => {
    el.addEventListener("click", () => {
      closeNotifPanel();
      switchView("announcements");
    });
  });

  if (notifications.some((n) => !n.read)) {
    await api("/api/notifications/read-all", { method: "POST" });
  }
  await refreshNotifBadge();
  await refreshAnnouncementBadge();
}

const NOTIF_VERBS = {
  announcement: "님이 공지사항을 게시했습니다",
  mention: "님이 댓글에서 회원님을 언급했습니다",
  ping: "님이 알림을 보냈습니다",
};

function notifItemHtml(n) {
  const isAnnouncement = Boolean(n.announcement_id);
  const clickable = Boolean(n.task_id) || isAnnouncement;
  const verb = NOTIF_VERBS[n.kind] || NOTIF_VERBS.ping;
  return `
    <div class="notif-item ${clickable ? "notif-item-clickable" : ""}" ${
    n.task_id ? `data-notif-task-id="${n.task_id}"` : ""
  } ${isAnnouncement ? `data-notif-announcement="1"` : ""}>
      ${avatarHtml(n.from_person, 26)}
      <div class="notif-item-body">
        <div class="notif-item-header">
          <span><strong>${escapeHtml(n.from_person)}</strong>${verb}</span>
          <span class="notif-item-time">${timeAgo(n.created_at)}</span>
        </div>
        ${
          n.task_name
            ? `<div class="notif-item-task">관련: ${escapeHtml(n.task_name)}</div>`
            : ""
        }
        ${
          n.announcement_subject
            ? `<div class="notif-item-task">${escapeHtml(n.announcement_subject)}</div>`
            : ""
        }
        ${n.message ? `<div class="notif-item-message">${escapeHtml(n.message)}</div>` : ""}
      </div>
    </div>
  `;
}

/* ---------- Funds ---------- */

async function loadFunds() {
  const data = await api("/api/funds");
  renderFunds(data);
}

function renderFunds(data) {
  const pct = data.goal > 0 ? Math.min(100, (data.total / data.goal) * 100) : 0;
  els.fundsBarFill.style.width = `${pct}%`;
  els.fundsCurrent.textContent = formatManwon(data.total);
  els.fundsGoalEl.textContent = `/ ${formatManwon(data.goal)}`;
}

function openFundsModal() {
  els.fundsForm.reset();
  openModal(els.fundsModal);
}

async function onSubmitFunds(e) {
  e.preventDefault();
  const amount = document.getElementById("funds-amount").value;
  const note = document.getElementById("funds-note").value;
  if (!amount || Number(amount) <= 0) return;
  await api("/api/funds", {
    method: "POST",
    body: JSON.stringify({ amount, note }),
  });
  closeModal(els.fundsModal);
  await loadFunds();
}

function openModal(overlay) {
  overlay.hidden = false;
}

function closeModal(overlay) {
  overlay.hidden = true;
}

init();
