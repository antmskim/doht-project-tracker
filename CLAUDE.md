# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internal task tracker for **DOHT**, an 11-person NYC content/partnerships
team, **UI entirely in Korean** (see the Language section below — this is
not an i18n-layer app, the Korean strings are the only strings). Board view
(To Do / In Progress / Done) with automatic due-date urgency badges and
**multi-assign** — a task can have zero, one, or several assignees at once.
**The
sidebar *is* the navigation, and "Board" is not a separate top-level
destination** — the People section (Everyone / Unassigned / each teammate)
is how you reach the board; clicking any of them both filters and switches
to Board view in one action (`setFilter()` calls `switchView("board")`).
Calendar (**month view only**), 도와주세요 (any task flagged as needing help,
across every assignee — see below), Announcements (subject + body,
auto-notifies everyone on post), and Resources (external link) are the only
other top-level nav items. **Pinging is `@mention`-based, not a button** —
type `@이름` inside any comment (task or announcement) and that person gets
notified when you post it; a message can `@mention` several people at once.
There is no dedicated "ping" UI element anymore. A small **funds progress
bar** lives in the sidebar (goal is a hardcoded constant, not user-editable).
One shared team passcode, but a **real per-person identity**:
login requires picking your name from the roster, and the server ties that
name to your session — it's the authoritative "who did this" for every
comment, announcement, mention, and funds entry, not a client-supplied field.
Everything with an author supports delete (no edit-in-place — delete and
re-post instead). Responsive down to phone width: under 720px the sidebar
becomes an off-canvas drawer. See [README.md](README.md) for the full
feature list and
deploy steps.

## Commands

```bash
npm install
cp .env.example .env     # set APP_PASSCODE before running
npm run dev                # node --watch src/server.js, http://localhost:3000
npm start                  # production mode, no watch
```

No test suite or linter is configured. There is no build step — `public/` is
served as-is.

## Architecture

Single Express app serving both the static frontend (`public/`) and the JSON
API (`/api/*`) — no separate client build, no framework on the frontend.
**The app is deployed two different ways from the same code**, split
specifically to make that possible:

- **`src/app.js`** — builds and exports the Express `app` (all middleware,
  all routers) but never calls `.listen()`. This is the one true app
  definition; both entry points below just hand it to something else.
- **`src/server.js`** — the local-dev / traditional-server entry point:
  loads `.env` (`dotenv`), awaits `db.init()`, then calls `app.listen()`.
  This is what `npm run dev`/`npm start` run.
- **`api/index.js`** + **`vercel.json`** — the Vercel serverless entry
  point: `api/index.js` just re-exports `src/app.js` (an Express app is
  already a valid Node request handler, no adapter needed), and
  `vercel.json` routes every request to it. No `.listen()` here — Vercel's
  Node runtime calls the exported app directly per request. `dotenv` isn't
  loaded here since Vercel injects env vars itself.
  Don't add anything to `src/app.js` that assumes a long-lived process
  (in-memory caches, `setInterval`, etc.) — serverless invocations are not
  guaranteed to reuse the same process between requests. The one thing that
  *is* safe to rely on staying "warm" across invocations on the same
  instance is `db.init()`'s memoized promise (see below), and even that must
  independently work correctly on a cold start.
- **`src/db.js`** — was a synchronous `better-sqlite3` file (local disk
  only) until the Vercel migration; now wraps `@libsql/client`, which speaks
  **identical SQL** against either a local SQLite file (`file:./data/tracker.db`,
  used automatically whenever `TURSO_DATABASE_URL` isn't set — this is what
  local dev and `npm run dev` use, no Turso account needed) or a real
  [Turso](https://turso.tech) database (`TURSO_DATABASE_URL` +
  `TURSO_AUTH_TOKEN` set, used in production on Vercel — the actual
  persistent storage, since Vercel's serverless functions have no durable
  local disk between invocations). **Every query is now async** — the module
  exports plain async functions (`get`, `all`, `run`, `exec`, `batch`) instead
  of better-sqlite3's `.prepare(sql).get/all/run()` chain; every route
  handler across `src/routes/*.js` is `async` and wrapped in
  `asyncHandler()` (`src/lib/asyncHandler.js` — Express 4 doesn't catch
  rejected promises from async handlers on its own, so this forwards them to
  the error-handling middleware in `app.js` instead of hanging the request).
  `db.batch(statements)` is the async equivalent of better-sqlite3's
  `db.transaction(fn)` — pass an array of `{ sql, args }` and they run
  atomically (used for multi-row writes like `setAssignees`,
  `notifyEveryoneOfAnnouncement`, `notifyMentions`, and the seed/migration
  steps below). `result.lastInsertRowid` comes back as a `BigInt` from
  `@libsql/client` — always wrap it in `Number(...)` before using it as a
  plain id (every route already does this; don't drop it in new code).
  **Initialization is no longer synchronous-on-require** — `db.init()`
  must be awaited before any query runs. It's memoized (calling it twice
  just returns the same promise/result), and `src/app.js` calls it via
  middleware on every request as a safety net, but `src/server.js` also
  awaits it explicitly before `listen()` so local dev never races a query
  against an unfinished migration.
  Schema creation and seeding happens inside `db.init()`: creates tables and
  seeds the `people` list if they don't already exist, so starting the
  server (or the first cold start on Vercel) is the only "migration" step.
  The people seed list is hardcoded in `SEED_PEOPLE` in this file — that's
  the only place team member names live server-side. Also carries a few
  one-time migrations that run unconditionally on every init (cheap no-ops
  once applied — these mostly matter for the local-file dev database, since
  a fresh Turso database never has the old shapes to begin with): rows from
  a long-gone per-task `updates` table get folded into `announcements` if
  that old table still exists; any task still holding the removed `WAITING`
  status moves to `IN_PROGRESS`; `announcements.subject` is added via
  `ALTER TABLE` for databases created before subject/body existed,
  backfilling old rows with `'Update'`; `sessions.person_name` is added the
  same way, with **all existing sessions deleted** immediately after (a
  session without a person tied to it can't be trusted for authorship);
  `notifications.kind` is added and backfilled (`'announcement'` where
  `announcement_id` is set, `'ping'` — the pre-@mention default — otherwise);
  `tasks.needs_help` is added defaulting to 0; and `tasks.assignee` (the old
  single-assignee column) has its data folded into `task_assignees` row by
  row before being dropped via `ALTER TABLE ... DROP COLUMN`. `foreign_keys
  = ON` and `journal_mode = WAL` pragmas are set best-effort (wrapped in
  try/catch) since they're meaningful for the local-file mode but may not
  apply the same way against a remote Turso connection.
- **`src/middleware/requireAuth.js`** — checks the session cookie against
  `sessions`, and — this is load-bearing — sets `req.person` from the
  session's `person_name` for every downstream route. Routes use `req.person`
  as the authoritative author for anything they create (task comments,
  announcements, announcement comments, `@mention` notifications); they no longer trust an
  `author` field from the request body. If `req.person` is ever missing on a
  matched session, `requireAuth` treats it as unauthenticated (401) rather
  than letting a route run with an undefined author.
- **`src/routes/auth.js`** — `POST /login` now requires both `passcode` and
  `name`; `name` must match a row in `people` (400 if not) and gets stored on
  the session alongside the token. `GET /session` returns `{ loggedIn, name }`
  so the frontend can restore "who am I" after a refresh.
- **`src/routes/people.js`** — deliberately mounted **without** `requireAuth`
  in `server.js` (the only public API route) — the login screen needs the
  roster before anyone is authenticated, to populate the "who are you?"
  picker.
- **`src/routes/notifications.js`** — read-only now (`GET /`,
  `GET /unread-count`, `POST /read-all`); it no longer has a `POST /` to
  create a notification — see the @mentions section above for where rows
  actually get created (`tasks.js`/`announcements.js`, via
  `src/lib/mentions.js`'s `notifyMentions`, plus `announcements.js`'s own
  `notifyEveryoneOfAnnouncement`). `to_person`/`from_person` are plain
  `people.name` strings. `GET /` and `GET /unread-count` are always scoped
  to `req.person` (the caller), never a query param — there's no way to
  read someone else's notifications through this API.
- **`src/routes/announcements.js`** — `POST /` (create an announcement) also
  runs `notifyEveryoneOfAnnouncement`, a `db.batch()` call that inserts one
  notification row per *other* person (`people.name != req.person`) with
  `announcement_id` set and no `task_id`/`message`. This is unconditional —
  every announcement notifies the whole roster, there's no per-announcement
  opt-out or per-user mute.
- **`public/app.js`** — one file, no bundler, no framework. Global `state`
  object (`people`, `tasks`, `helpTasks`, `meetings`, `filter`, `view`, `me`,
  `monthCursor`) + direct DOM manipulation (`innerHTML` templates,
  manual event listener attachment after each render — any function that
  re-renders a container's `innerHTML` must re-attach listeners for elements
  inside it, see
  `renderTaskModal`/`loadAnnouncements`/`renderCalendar`/`loadNotifications`).
  `api()` is the fetch wrapper used everywhere; a 401 response redirects to
  the login screen from any call site. `state.me` is set once at login (or
  from `GET /api/auth/session` on refresh) and used to render "posting as"
  displays — there is no longer a client-side author picker anywhere
  (comments, announcements); the server derives authorship from the
  session (see `requireAuth` above). **Task comments and the Announcements
  feed are unrelated features that happen to share the same visual
  "composer" pattern and the same avatar/delete-button markup** — opening a
  task never fetches announcements, and posting an announcement never
  references a task. Don't merge them back into one concept; that's what
  this app looked like before and it was explicitly split apart on user
  feedback. Announcements *do* have their own comment thread
  (`announcement_comments`), fetched N+1-style (one request per announcement)
  in `loadAnnouncements` — fine at this team's scale, would need batching at
  real scale.
  Calendar is month-only: `startOfWeek` is still used internally (to find the
  Monday on/before the 1st, for leading-day padding), but there is no week
  *view* — `renderCalendar()` always renders the month grid into
  `#calendar-month-grid`. `meetings.day_of_week` uses JS-native
  `Date.getDay()` values (0=Sunday..6=Saturday) — matching a meeting to a
  displayed day is just `meeting.day_of_week === date.getDay()`, no Mon/Sun
  remapping needed.
  The notification bell polls `GET /api/notifications/unread-count` every
  30s (`setInterval` started once in `bootstrap`, guarded by
  `state.notifPollStarted` so logging out and back in in the same page load
  can't stack a second interval); opening the panel fetches the full list
  and marks everything read in one call (`POST /read-all`) — there's no
  per-item read/unread UI, "opened the panel" is treated as "seen".
  `notifItemHtml()` picks its verb text from `n.kind` (`NOTIF_VERBS` map) —
  see the @mention section below for what creates each kind.
  The board's person filter lives in the sidebar (`#sidebar-people`), not the
  navbar: `renderSidebar()` appends one button per person after the two
  static ones ("Everyone" → `value=""`, "Unassigned" → `value="__unassigned__"`)
  already in `index.html`; `setFilter(value)` handles all of them uniformly.
  `"__unassigned__"` is a sentinel the backend special-cases (see
  `tasks.js` below) — it is never a real person name, so it can't collide
  with `people.name`.

## @mentions (pinging) — replaced the old per-comment ping button

Pinging used to be a dedicated bell-icon button per comment that could only
notify *that comment's author*, one at a time, via a separate confirm modal.
That's gone. Now: typing `@이름` anywhere inside a task comment or an
announcement comment notifies that person the moment the comment is posted
— no button, no modal, and a single comment can `@mention` several people at
once (`"@Mina @David 확인 부탁드려요"` pings both).

- **`src/lib/mentions.js`** is the shared, server-side source of truth —
  never trust a client-side parse for this, since the notification rows it
  creates are the real side effect. `extractMentions(message, authorName)`
  matches `@name` against the real `people` table (not an arbitrary
  `@word`), checking **longest names first** and blanking each match out of
  a working copy of the string as it's found — this is what stops "김영채"
  from being misread as also mentioning "김영" just because it shares a
  prefix. The author's own name is filtered out of the result (via the same
  blank-then-filter approach, not a special-cased skip) so a comment can
  never notify its own author. `notifyMentions({ message, fromPerson,
  taskId, announcementId })` is the side-effecting half: calls
  `extractMentions`, then inserts one `notifications` row per mentioned
  person with `kind: 'mention'` and whichever of `taskId`/`announcementId`
  it was given (always exactly one, never both). Both
  `POST /api/tasks/:id/comments` and `POST /api/announcements/:id/comments`
  call it right after inserting the comment. **Mentions in the body of an
  announcement post itself are not parsed this way** — posting an
  announcement already notifies the entire roster
  (`notifyEveryoneOfAnnouncement`), so a mention there would just be a
  redundant second notification to someone who's already getting one; only
  *comments* create mention notifications.
- **`notifications.kind`** distinguishes the three things that can land in
  this one table: `'announcement'` (the broadcast every teammate gets when
  someone posts one), `'mention'` (the above), and `'ping'` (legacy only —
  rows created by the old manual button before this system existed; nothing
  creates this kind anymore, it only exists so old rows still render a
  sensible verb). `public/app.js`'s `NOTIF_VERBS` map picks the notification
  panel's verb text from this field.
- **Frontend**: `attachMentionAutocomplete(inputEl)` wires up a live "@"
  dropdown on any comment composer (task comment textarea, announcement
  post textarea, announcement reply input) — as you type `@partial`, it
  filters `state.people` by substring match and shows up to 6 suggestions
  in a `.mention-dropdown` positioned via plain `position: absolute`
  (its containing block, the composer, has `position: relative` — safe
  here because these composers don't sit inside a `transform`ed ancestor
  the way `.sidebar` does; see the CSS gotcha #4 above about why that
  distinction matters). Clicking a suggestion uses `insertMention()` to
  splice the full name in at the cursor (not append-to-end), so mentioning
  someone mid-sentence works correctly. The dropdown's option buttons use
  `mousedown` + `preventDefault()` rather than `click`, so selecting one
  doesn't first fire the input's `blur` and tear the dropdown down before
  the click registers.
  Rendering a message that contains mentions goes through
  `renderMentionsHtml(message)` — escapes the text first, *then* wraps any
  `@realPersonName` substring in `<span class="mention">`, so this can never
  turn attacker-controlled text into markup (the escape happens before the
  wrap, and the only thing ever inserted unescaped is the literal `@` plus
  an already-escaped, roster-verified name). Every place a comment/
  announcement message renders (`commentItemHtml`, `announcementItemHtml`,
  the announcement's own body) uses this instead of a bare `escapeHtml()`.

## 도와주세요 (needs-help flag)

A task can be flagged "needs help" independent of who it's assigned to —
for when someone's stuck and wants eyes on it from anyone on the team, not
just their own assignees. `tasks.needs_help` (0/1) is the flag;
`GET /api/tasks?needs_help=1` is the only query that reads it (combinable
with `?assignee=`, though the frontend never combines them — the
도와주세요 tab always asks for every flagged task regardless of assignee).
`POST`/`PATCH /api/tasks/:id` accept `needs_help` as a boolean in the body,
same undefined-means-unchanged convention as every other task field.

The 도와주세요 nav item (`.tab[data-view="help"]`, sits between 캘린더 and
공지사항) works like Calendar/Announcements — a real top-level view
(`#help-view`), not a sidebar person-filter entry — because it deliberately
ignores the assignee filter; that's the point of it. It reuses the same
column/card markup as the board (`boardColumnsHtml(tasks)` and
`attachBoardListeners(container, opts)` were factored out of `renderBoard()`
specifically so `#board-columns` and `#help-columns` share one template
rather than drifting apart). `loadHelpTasks()` populates `state.helpTasks`
and re-renders `#help-columns` whenever the tab is switched to
(`switchView("help")` triggers it, same pattern as `loadCalendar()`/
`loadAnnouncements()`).
`refreshTaskLists()` — not `loadTasks()` alone — is what task
create/edit/delete call now: it always refreshes the board, and *also*
refreshes the help tab's own list if that's the currently open view, since
`loadTasks()` alone only touches `state.tasks` (assignee-filtered), never
`state.helpTasks` (needs_help-filtered). Don't call `loadTasks()` directly
from a task-mutating handler going forward — call `refreshTaskLists()`, or
the help tab will show stale data after an edit made while it's open.
The nav badge count (`#help-nav-badge`) is computed client-side inside
`refreshSidebarCounts()` (which already fetches the full unfiltered task
list for the per-person sidebar counts) rather than via a server
unread-count endpoint like the announcements badge — it's a plain derived
stat ("how many open tasks currently need help"), not something tied to a
per-user read/unread state.
The toggle itself is `.help-toggle` (a plain button with a `.selected`
class, not a native checkbox) — one instance in the new-task modal
(`#new-task-help-toggle`), one in the edit-task modal
(`#edit-needs-help-toggle`, pre-checked from `task.needs_help` on render,
autosaves via the same `saveTaskField()` path every other edit-modal field
uses). Cards needing help show a `.help-pill` badge in `.card-top` next to
the due-date pill (`.card-top` has `flex-wrap` for exactly this reason —
two pills plus the task code can wrap on a narrow card without needing a
media query).

## Brand

The team's actual logo is a wordmark, "DO(–)T" (the "H" replaced by a
parenthesis-dash-parenthesis glyph) in bold white. There's no logo image
file — it's recreated as styled text: `.brand-icon` (small, plain text, sits
in the sidebar header) and `.wordmark` (large, used on the black login
screen). Both rely on `.wordmark-h` to color just the `(–)` glyph with
`--gold`. If a real logo/font file ever gets exported, that's the pair of
classes to point at it instead of maintaining a hand-coded approximation.

**Redesigned (from a Claude Design mockup the team picked) to a
permanently-dark sidebar against a light main area**, rather than the
earlier all-light layout. Palette (`:root` in `public/styles.css`):
`--sidebar-bg`/`--sidebar-*` (the `#191a1c` family — the sidebar is dark
*everywhere*, not just the login screen/brand badge like the previous
version) against `--bg`/`--surface` (the `#f2f2f0` warm-cream family) for
the main content area. **Single accent**: `--gold` on dark backgrounds,
`--gold-deep`/`--gold-mid` on light backgrounds — the earlier two-accent
coral (`--accent`, `#ff3d68`) + gold system was deliberately collapsed to
one accent. Gold is reserved for small touches (icons, links, badges, the
funds bar, pill fills) — **never a button's own fill**; `.btn-primary` /
`button[type=submit]` fill near-black (`--ink`) with white text instead
(gold-filled buttons read as too loud/generic-SaaS). Don't reintroduce a
second accent color or start filling primary buttons with `--gold` — both
were explicit outcomes of this redesign, not incidental choices.

Two typefaces, both loaded from Google Fonts in `index.html`'s `<head>`:
Public Sans for all body text, IBM Plex Mono (`--font-mono`) for anything
meta/machine-generated — task codes (`DOHT-<id>`), counts, timestamps,
uppercase tracked labels. Don't use the mono font for prose/body copy or the
body font for codes/counts — that pairing is what gives cards their
Linear-like density.

**Avatars are a generic silhouette badge, not per-person initials/colors**
(`avatarHtml()` in `public/app.js`, one shared `AVATAR_SILHOUETTE_SVG`
constant) — a Facebook-style "no photo yet" placeholder: a fixed neutral
gray circle (`--avatar-bg`/`--avatar-icon` in `styles.css`) with a person
silhouette icon, identical for every person. There's no longer a
name-derived hue or initials anywhere (`hueForName`/`initialsForName` were
removed) — every call site (cards, comments, announcements, the sidebar
person list, the current-user chip) renders the exact same
markup regardless of whose name is passed in; only the `title` attribute
(hover tooltip) differs per person. If the team ever adds real profile
photos, that's the point to swap `avatarHtml()`'s `<svg>` output for an
`<img>` with a per-person URL, not to reintroduce per-name colors.

## Layout (Linear-inspired: sidebar *is* the nav, not a topbar)

There is no top navbar. `.app-shell` is a full-height flex row:
`.sidebar` (fixed 236px, own scroll, `position: sticky; top: 0; height: 100vh`)
and `.main-area` (flex: 1). The sidebar carries everything that used to live
in a header — brand mark, the funds widget, the Calendar/Announcements/
Resources nav (`.tab` class + `data-view` attribute — styled as a vertical
icon+label list instead of horizontal pills), the People filter
(`.sidebar-person`/`#sidebar-people`), and a footer row (notification bell,
current-user chip, log out) pinned to the bottom via `.sidebar-spacer`
(`flex: 1` spacer above the footer).

**"Board" is not a `.tab[data-view]` item and never appears in the top nav
list** — it was removed on user feedback ("what's the point of a Board nav
item when clicking a person already takes you there?"). The People section
*is* the only way into the board: `setFilter(value)` (fired by clicking any
`.sidebar-person`) sets the filter, updates `#board-title`'s text (`보드 ·
<label>`), and unconditionally calls `switchView("board")`. Don't add
`data-view="board"` back onto the People buttons to "unify" them with the
generic tab mechanism — a static "Everyone" and "Unassigned" button sharing
one `data-view` value with `switchView`'s blanket
`tab.classList.toggle("active", tab.dataset.view === view)` logic would mark
*both* active simultaneously the moment either is clicked (already hit this
once while building it). Keep the two mechanisms decoupled: `.tab` elements
own "which page", `.sidebar-person` elements own "which filter", and
`setFilter` is the only bridge between them.

`#notif-panel` is `position: fixed`, not `position: absolute` inside
`.notif-wrap` — its `left`/`bottom` are set by `positionNotifPanel()` in
`app.js` from `#notif-bell-btn`'s own `getBoundingClientRect()`, recomputed
every time it opens. This was a deliberate fix: `.sidebar` has
`overflow-y: auto`, and an absolutely-positioned popover trying to escape an
`overflow: auto` ancestor gets clipped by it (the panel was reported as "cut
off"). `position: fixed` escapes ancestor overflow clipping entirely, at the
cost of needing to compute its position in JS instead of via CSS anchoring.

**`#notif-panel` is also *not* a DOM descendant of `.sidebar` anymore** — it
lives directly in `#app-screen`, as a sibling of `.app-shell`, with only the
bell button (`#notif-bell-btn`, inside `.notif-wrap`) staying in the
sidebar footer. This was a second, less obvious instance of the same
clipping bug, reported specifically on mobile: any ancestor with a CSS
`transform` becomes the containing block for a descendant's
`position: fixed` (per spec), so once `.sidebar` picked up
`transform: translateX(...)` for the off-canvas mobile drawer, a
`position: fixed` `#notif-panel` nested inside it silently stopped being
viewport-relative and got clipped by `.sidebar`'s `overflow-y: auto` again —
even though the CSS still said `position: fixed`. Moving the panel out of
the sidebar's DOM subtree entirely sidesteps this regardless of what
transforms get added to `.sidebar` later. The outside-click-to-close handler
in `app.js` checks both `.notif-wrap` and `#notif-panel` (`e.target.closest`)
since they're no longer nested in each other. **If you add another popover
that's anchored to a sidebar control, render/append it outside `.sidebar`'s
DOM subtree** (not just `position: fixed` inside it) — `position: fixed`
alone doesn't survive a transformed ancestor.

Each view (`#board-view` / `#calendar-view` / `#announcements-view`) owns a
`.view-header` (page title + at most one primary action, e.g. "New task")
followed by a `.view-body` (the actual padded, max-width-1400px content) —
this replaced a single global `<header class="topbar">` that used to sit
above everything. If you add a new top-level view, give it the same
`.view-header` + `.view-body` shape rather than inventing a new header
pattern per view.

Icons are hand-written inline SVG (16x16 viewBox, `stroke="currentColor"`,
no fill) directly in `index.html` for anything static (sidebar nav, footer
buttons, calendar prev/next) — there's no icon component or sprite sheet.
**No emoji anywhere in the UI** — an earlier version used 📣/🔔 for
ping/notifications; those were deliberately replaced with the bell SVG (this
was called out as looking "AI-generated"/unpolished). If you add a new
button that needs an icon, hand-write an SVG in the same style rather than
reaching for an emoji or pulling in an icon library.

Base font-size is set on `html` (14px, not the browser default 16px) — this
is the single global density knob. Nearly every size in this file is in
`rem`, so that one line is what makes the whole app read as tight/dense
(Linear-like) instead of the looser default scale everything was designed at
originally. Don't "fix" apparent small-text by bumping individual `rem`
values back up — if density is ever wrong app-wide, change `html`'s
font-size, not individual components.

**Board fills the viewport height instead of floating as a few short boxes**
(reported as looking "empty"): `#board-view .view-body` and `.board` are
both `flex: 1; min-height: 0`, and `.column` is `display: flex; flex-direction:
column`, so the three columns stretch to the bottom of the screen regardless
of how few cards they hold. This stretch rule is scoped to `#board-view
.view-body` specifically — Calendar and Announcements keep the plain
(non-stretched, content-height) `.view-body`.

**Task modal status control**: `#edit-status` (a `<select>`) was replaced by
a 3-way segmented control (`.status-segmented` > three `.status-segment`
buttons, 할 일/진행 중/완료) — clicking a segment toggles `.active` on it and
calls the same `saveTaskField("status", ...)` path a `<select>` change used
to. Don't reintroduce `#edit-status`; if you need to read/set the task
modal's current status in JS, query `.status-segment.active` instead.

**Mobile (`max-width: 720px`)**: `.sidebar` becomes `position: fixed`,
off-canvas by default (`transform: translateX(-100%)`), slid in via a
`.open` class toggled by `#mobile-menu-btn` (only visible at this
breakpoint). `#sidebar-backdrop` is the dimmed full-viewport overlay behind
it — clicking it, or clicking any `.tab` or `.sidebar-person` (i.e.
navigating anywhere), calls `closeMobileSidebar()`. That close call is
unconditional and harmless on desktop (the class toggle is a no-op there),
so don't gate it behind a viewport-width check in JS — let the CSS media
query be the only thing that decides whether the drawer behavior is visible.

## Known CSS gotcha (already fixed four times, watch for regressions)

This file's CSS bugs have mostly been the same root cause — a rule loses
when you'd expect it to win, because of specificity or source order — three
times, plus one related-but-distinct positioning gotcha:

1. `.screen[hidden]` vs `#login-screen { display: flex }` (ID beats class) —
   fixed with a global `[hidden] { display: none !important }` rule at the
   top of the file. Don't add per-element `display` rules that could fight
   `[hidden]` again.
2. `#task-modal-body input/select/textarea { width: 100% }` vs a
   component-scoped `select { width: 120px }` inside that same modal (ID
   beats class) — fixed by scoping the override as
   `#task-modal-body .some-form select { ... }`. If you add a new form row
   inside `#task-modal-body` (or any other ID-scoped container) that needs a
   non-100%-width control, prefix the override selector with that same ID.
3. `.calendar-item-delete { opacity: 1 }` vs the shared
   `.item-delete-btn { opacity: 0 }` (equal specificity, but
   `.item-delete-btn` appears *later* in the file, so it won on the tie) —
   fixed with `.calendar-meeting .calendar-item-delete { opacity: 1 }`, which
   wins on specificity instead of relying on being later in the file. When
   two single-class selectors have equal specificity, the one lower in the
   file wins regardless of which one looks like the "override" — don't
   assume the more specific-sounding class name wins; check actual
   specificity or combine selectors to be sure.
4. `#notif-panel` (`position: fixed`) still got clipped on mobile even
   though it was already the fix for the *original* version of this bug —
   because it lived inside `.sidebar`, and `.sidebar` gained
   `transform: translateX(...)` for the mobile off-canvas drawer. A
   `transform` on an ancestor makes that ancestor the containing block for a
   descendant's `position: fixed`, silently downgrading it to
   `.sidebar`-relative (and thus clippable by `.sidebar`'s
   `overflow-y: auto`) again. Fixed by moving `#notif-panel` out of
   `.sidebar`'s DOM subtree (see Layout section above) rather than by
   touching its CSS at all — `position: fixed` alone is not sufficient if
   any ancestor might ever get a `transform`.

General rule: when a style silently doesn't apply, don't guess — check
computed specificity and source order before adding another rule on top;
for anything `position: fixed`, also check whether an ancestor has a
`transform` (or `filter`/`perspective`/`will-change: transform`) before
trusting that it's actually viewport-relative.

## Data model

- **people** — seeded name list (see `SEED_PEOPLE` in `src/db.js`).
- **tasks** — `name`, `due_date` (optional), `notes`, `status` (`TODO` /
  `IN_PROGRESS` / `DONE` — `WAITING` was removed; see migration note above),
  `needs_help` (0/1 — the 도와주세요 flag, see that section above).
  **No `assignee` column anymore** — see `task_assignees` below. Its display
  code (`DOHT-<id>`) is derived from the DB id at render time (`taskCode()`
  in `public/app.js`) — no separate counter column. Due-date urgency is a
  tiered due-pill, derived client-side from `due_date`/`status`, not stored
  (see `dueDatePill()` in `public/app.js` — replaced the older 5-tier
  `urgencyForTask`; tiers are done/overdue/today/tomorrow/day-after-tomorrow/
  further-out).
- **task_assignees** — **multi-assign join table**: `task_id` (FK,
  `ON DELETE CASCADE`) + `person_name`, composite primary key (so the same
  person can't be added twice to one task; `INSERT OR IGNORE` is used
  defensively anyway). Replaced the old single `tasks.assignee` text column
  — a task can now have zero, one, or several assignees. `src/routes/tasks.js`
  exposes this as `assignees: string[]` on every task response
  (`withAssignees()`), never the raw table. Writing assignees is always a
  **full replace**, not a diff: `setAssignees(taskId, assignees)` deletes all
  existing rows for that task and re-inserts the given array (deduped,
  blank/whitespace entries dropped) inside one transaction — both
  `POST /api/tasks` and `PATCH /api/tasks/:id` call it this way, so the
  client always sends the *complete* desired assignee list, never a single
  add/remove delta. `PATCH` only touches assignees when the `assignees` key
  is present in the request body at all (`undefined` means "leave
  unchanged", matching every other field on that route) — sending
  `assignees: []` explicitly clears them. `GET /api/tasks?assignee=<name>`
  now means "this person is *one of* the assignees" (`task_id IN (SELECT
  task_id FROM task_assignees WHERE person_name = ?)`), so a task shared by
  two people shows up under both of their board filters and both of their
  sidebar counts — it is not split or duplicated, it's the same task
  appearing wherever it's relevant. `assignee=__unassigned__` matches tasks
  with zero rows in `task_assignees` (`task_id NOT IN (SELECT task_id FROM
  task_assignees)`).
  On the frontend: `public/app.js`'s `assignee-picker`/`assignee-option`
  (toggle-chip list, one chip per person, `.selected` class = currently
  assigned) replaced the old single `<select>` in both the new-task and
  edit-task modals — `getSelectedAssignees(container)` reads the currently
  `.selected` chips back out at save time, `bindAssigneePicker(container)`
  wires the click-to-toggle behavior (attach once per container; re-render
  via `.innerHTML =` doesn't need it rebound since it's event-delegated on
  the container itself, except `#task-modal-body`'s content which is fully
  replaced per task open and so rebinds each time, same as its other
  listeners). Cards and the task modal show multiple assignees as an
  overlapping `avatarStackHtml()` (caps at 3 shown + a "+N" tail) plus a
  `assigneeSummaryLabel()` text (`"김영"` alone, or `"김영 외 2명"` for more
  than one) — don't reintroduce a single `avatarHtml(task.assignee)` call
  anywhere, `task.assignee` (singular) no longer exists on the wire.
- **task_comments** — `task_id` (FK, `ON DELETE CASCADE`), `author`,
  `message`, `created_at`. A discussion thread scoped to one task; fetched
  via `GET /api/tasks/:id/comments`, posted via `POST` to the same path,
  deleted via `DELETE /api/tasks/:id/comments/:commentId`.
- **announcements** — `subject`, `author`, `message`, `created_at`. Not
  linked to a task — this is the entire Announcements feed, a flat
  chronological list for team-wide news (funding, partnerships, etc.),
  separate from task work. Supports `DELETE /api/announcements/:id`.
- **announcement_comments** — `announcement_id` (FK, `ON DELETE CASCADE`),
  `author`, `message`, `created_at`. Mirrors `task_comments` but for
  announcements: `GET`/`POST /api/announcements/:id/comments`,
  `DELETE /api/announcements/:id/comments/:commentId`.
- **meetings** — `title`, `day_of_week` (JS `Date.getDay()` convention: 0=Sun
  .. 6=Sat), `time` (`HH:MM`, validated server-side with a regex). Recurring
  by construction — no specific date is stored, so a meeting shows up on the
  same weekday every week until deleted (`DELETE /api/meetings/:id`).
- **notifications** — `from_person`, `to_person`, `message` (optional),
  `task_id` (FK, `ON DELETE SET NULL` — outlives the task), `announcement_id`
  (FK, `ON DELETE SET NULL` — outlives the announcement), `kind`
  (`'announcement'` / `'mention'` / legacy `'ping'` — see the @mentions
  section above), `read` (0/1). A row has `task_id` set (a mention inside a
  task comment) *or* `announcement_id` set (an announcement broadcast, or a
  mention inside an announcement comment), never both — the frontend uses
  whichever is present to decide the notification's click target, and
  `kind` to decide its verb text.
  `GET /api/notifications` and `GET /api/notifications/unread-count` are
  always scoped to the caller (`req.person`) as `to_person`. There is no
  longer a `POST /api/notifications` — every notification is now a side
  effect of something else (posting a comment that `@mention`s someone, or
  posting an announcement), created directly by that route handler via
  `notifyMentions()`/`notifyEveryoneOfAnnouncement()`, never a standalone
  client-initiated call. `POST /read-all` marks the caller's as read.
- **sessions** — `token` (cookie value), `person_name` (which teammate this
  session is logged in as — see `requireAuth`), `created_at`. This is what
  makes automatic authorship and "`@mention` *you* specifically" possible; a
  session without a `person_name` is treated as logged out.
- **funds** — `amount` (integer, **만원 units** — a row of `500` means
  5,000,000원, not 500원; there's no won-level precision anywhere in this
  feature), `note` (optional), `added_by`, `created_at`. `GET /api/funds`
  returns `{ goal, total, entries }` where `total` is `SUM(amount)` computed
  in SQL and `goal` is the hardcoded `GOAL_MANWON` constant in
  `src/routes/funds.js` (currently 5000, i.e. the team's 5,000만원 target) —
  there is no way to change the goal from the UI, it's a code change.

## Language

Every UI string is Korean — this is not a translated layer over an English
original, the Korean text *is* the source in `public/index.html`,
`public/app.js` (labels, empty states, `confirm()` dialogs, relative
timestamps in `timeAgo()`, due-date pill labels in `dueDatePill()`), and the
`error` strings returned by `src/routes/*.js` / `src/middleware/
requireAuth.js`. Number/date formatting uses `.toLocaleString("ko-KR")` /
`.toLocaleDateString("ko-KR", ...)` rather than hardcoded formats, so it
follows Korean grouping/date conventions automatically. There is no i18n
framework, no strings file, and no language switcher — if another language
is ever needed, that's new infrastructure to build, not a matter of adding
strings back.
