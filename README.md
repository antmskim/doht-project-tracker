# DOHT Team Tracker

A lightweight task board for the DOHT team (NYC content & partnerships), laid
out like a real project tool (sidebar-driven navigation, not a top navbar).
**The UI is entirely in Korean** — see [Language](#language) below.

- **Sidebar is the nav — there's no separate "Board" page.** The People
  section (전체/Everyone, 담당자 없음/Unassigned, then each teammate) *is* how
  you reach the board — clicking any of them switches to Board and filters it
  in one action. Calendar / 도와주세요 / Announcements / Resources sit above
  it as the only other top-level destinations.
- **Board** — To Do / In Progress / Done, per-task comments, and a due-date
  pill on every card (지남/오늘 마감/내일 마감/D-2/plain date/완료 — see
  `dueDatePill()` in `public/app.js`). The columns stretch to fill the
  screen's height rather than floating as a few short boxes on a mostly-empty
  page. "+ New task" pre-checks whichever person's board you're currently
  viewing as an assignee (none checked when viewing Everyone/Unassigned).
  Each task has a Linear-style code (`DOHT-<id>`, derived from its DB id —
  no separate counter) shown on its card and in the task modal's top bar.
  The task modal uses a 3-way segmented control (할 일/진행 중/완료) instead
  of a dropdown to change status.
- **Multi-assign** — a task can have any number of assignees, not just one.
  Both the new-task and edit-task modals show every teammate as a toggle
  chip (담당자); click as many as apply. A task shows up on *every* assigned
  person's filtered board and counts toward *all* of their sidebar counts —
  it's shared, not duplicated. Cards show an overlapping avatar stack plus a
  short label (a name alone, or `"이름 외 N명"` when there's more than one).
- **Funds tracker** — a small progress bar in the sidebar toward a 5,000만원
  (50M KRW) goal. The "+" next to it logs a contribution (amount in 만원 +
  optional note) and the bar animates to the new total.
- **Calendar** — a full month grid combining recurring weekly meetings (book
  one on any weekday + time, repeats every week) with task due dates.
- **도와주세요 (needs help)** — a task can be flagged as needing help,
  independent of who it's assigned to. The 도와주세요 nav tab shows every
  flagged task from the whole team, across all assignees, still split into
  the same To Do/In Progress/Done columns — a shared radar for "someone's
  stuck, come take a look" that isn't limited to your own board. Toggle the
  flag from the new-task form or from inside any task.
- **Announcements** — a team-wide feed (subject + body) for news, funding,
  anything not tied to a specific task, with its own comment thread per post.
  Posting one notifies every other teammate automatically. The sidebar nav
  item shows a small unread-count badge scoped to announcement notifications
  specifically (`GET /api/notifications/unread-count?type=announcement`).
- **Sidebar counts** — every person row (plus 모든 업무/담당자 없음) shows a
  live count of their open tasks, computed client-side from a full
  unfiltered task fetch (`refreshSidebarCounts()` in `public/app.js`) and
  refreshed after every task mutation.
- **@mentions & notifications** — no ping button; type `@이름` anywhere in a
  task or announcement comment and that person is notified the moment you
  post it. Mention several people in one comment and all of them get
  notified — `"@Mina @David 확인 부탁드려요"` pings both. Start typing `@` and
  a dropdown of matching teammates appears so you don't have to get the
  spelling exact. The bell at the bottom of the sidebar shows an unread
  badge and a dropdown of everything addressed to you — mentions and
  announcement broadcasts alike. The dropdown is `position: fixed`,
  positioned by JS from the bell's own coordinates each time it opens, so
  it's never clipped by the sidebar's own scroll box.
- **Mobile** — under 720px the sidebar becomes an off-canvas drawer (a
  hamburger button top-left opens it over a dimmed backdrop); selecting a
  page or person closes it automatically.

One shared team passcode, but a real per-person identity: at login you pick
who you are from the team roster, and that's who you are for the session —
your name is used automatically as the author on comments/announcements,
no per-action "post as" picker anymore.

## Stack

Single Node.js + Express server, plain HTML/CSS/JS frontend (no build step,
no framework). Storage is SQLite-compatible via [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts) —
locally that's just a plain file at `data/tracker.db`, no setup required; in
production it points at a free [Turso](https://turso.tech) database instead
(same SQL, just remote), which is what makes it possible to run this on
Vercel's serverless free tier with no server to manage. See "Deploying" below.

## Local development

```bash
npm install
cp .env.example .env   # set APP_PASSCODE to whatever you want the team to use
npm run dev
```

Visit http://localhost:3000. The SQLite file is created at `data/tracker.db`
on first run and seeded with the team's names (edit `SEED_PEOPLE` in
[src/db.js](src/db.js) to change who shows up in the login picker, the
assignee chip lists, and the sidebar filter — existing names already in the
database are left alone, so it's safe to add more people later by editing
that list and restarting the server).

## Deploying so teammates can reach it remotely (free, 24/7)

**This is live** at **https://doht-project-tracker.vercel.app** — hosted on
[Vercel](https://vercel.com)'s free tier (serverless, no server to manage,
auto-scales to zero cost when idle) with data in a free
[Turso](https://turso.tech) database (`doht-tracker`, SQLite-compatible, so
`src/db.js` talks to it with the exact same SQL as local dev — see the Stack
section above). The code lives at
[github.com/antmskim/doht-project-tracker](https://github.com/antmskim/doht-project-tracker)
(private repo).

**To redeploy after making changes:**

```bash
git add -A && git commit -m "..." && git push
vercel --prod
```

(`git push` alone doesn't auto-deploy yet — that needs Vercel's GitHub App to
be authorized for this repo once, from the Vercel dashboard's project
settings → Git → Connect Repository. Until that's done, `vercel --prod` is
the actual deploy step; running it from a directory already linked via
`vercel link` — already done here — picks up the right project automatically.)

**Environment variables** are already set on Vercel (`vercel env ls` to see
them): `APP_PASSCODE`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NODE_ENV`.
To change the team passcode: `vercel env rm APP_PASSCODE production` then
`echo "new-passcode" | vercel env add APP_PASSCODE production`, then
redeploy for it to take effect.

**To add a database backup / inspect data directly:** `turso db shell
doht-tracker` opens a SQL shell against the live production database (e.g.
`SELECT * FROM tasks;`). `turso db show doht-tracker` prints its URL;
`turso db tokens create doht-tracker` mints a new auth token if needed.

<details>
<summary>Alternative: self-host with Docker (no Vercel/Turso, keeps SQLite as a local file)</summary>

`docker-compose.yml` + `Caddyfile` + `Dockerfile` in this repo run the app
the traditional way — a real always-on server with a local SQLite file. This
needs its own persistent Linux server, though; **Oracle Cloud's Always Free
tier** is the one genuinely-free-forever option with real persistent
storage (Render/Fly/Koyeb's free tiers all lack persistent disks — a free
web service there would silently lose the database on every restart).

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/),
   create an Ampere A1 (Arm) Always Free compute instance with a reserved
   public IP, and open ports 80/443 in its Security List.
2. Point a free [DuckDNS](https://www.duckdns.org) subdomain at the
   instance's IP.
3. On the instance: `curl -fsSL https://get.docker.com | sudo sh`, open the
   OS-level firewall too (`sudo iptables -I INPUT -p tcp --dport 80 -j
   ACCEPT` and the same for 443), `git clone` this repo, create a `.env`
   with `APP_PASSCODE` and `DOMAIN=your-name.duckdns.org`, then
   `docker compose up -d --build`. Caddy handles HTTPS automatically.

`tracker_data` is a Docker named volume, so the SQLite file survives
restarts and reboots. To back it up:
`docker compose cp app:/app/data ./backup-$(date +%F)`.
</details>

<details>
<summary>Alternative: pay a few dollars/month instead (Fly.io)</summary>

Fly.io no longer has a free tier for new accounts, but it's simple and cheap
(~$2–5/month for a machine this small) and this repo's `fly.toml` is already
set up for it:

```bash
brew install flyctl        # or see https://fly.io/docs/flyctl/install/
fly auth login
fly launch --no-deploy      # detects the Dockerfile, picks/confirms an app name,
                             # updates fly.toml — say no to a Postgres/Redis DB
fly volumes create tracker_data --size 1   # 1GB, persistent disk for the SQLite file
fly secrets set APP_PASSCODE=whatever-your-team-passcode-is
fly deploy
```

After that, `fly deploy` redeploys your latest code. The volume (and its
data) survives redeploys; `fly volumes list` / `fly volumes destroy` manage
it directly.
</details>

## How it's organized

- [src/app.js](src/app.js) — the actual Express app: serves `public/` as
  static files and mounts the API routers under `/api`. Never calls
  `.listen()` itself — see the two entry points below.
- [src/server.js](src/server.js) — local-dev entry point (`npm run
  dev`/`npm start`): loads `.env`, waits for the database to be ready, then
  calls `app.listen()`.
- [api/index.js](api/index.js) + [vercel.json](vercel.json) — the Vercel
  serverless entry point; just re-exports `src/app.js` for Vercel's Node
  runtime to call directly per-request, no `.listen()`.
- [src/db.js](src/db.js) — async SQLite-compatible client
  (`@libsql/client`); a local file (`data/tracker.db`) unless
  `TURSO_DATABASE_URL` is set, in which case it talks to that Turso database
  instead — same code, same SQL, either way. Creates tables and seeds the
  people list on first call to `db.init()`.
- [src/routes/](src/routes/) — one router per resource (`auth`, `people`,
  `tasks`, `announcements`, `meetings`, `notifications`, `funds`). Task
  comments live at `/api/tasks/:id/comments` (inside `tasks.js`); announcement
  comments live at `/api/announcements/:id/comments` (inside
  `announcements.js`).
- [src/middleware/requireAuth.js](src/middleware/requireAuth.js) — gates
  every `/api/*` route except `/api/auth/*` behind a session cookie.
- [src/lib/asyncHandler.js](src/lib/asyncHandler.js) — wraps async route
  handlers so a rejected promise reaches Express's error handler instead of
  hanging the request (Express 4 doesn't do this on its own).
- [public/](public/) — the whole frontend: `index.html` + `app.js` (vanilla
  JS, no build step) + `styles.css`.
- [Dockerfile](Dockerfile) + [docker-compose.yml](docker-compose.yml) +
  [Caddyfile](Caddyfile) + [fly.toml](fly.toml) — the self-hosted deploy
  paths (see the collapsed sections above); unused by the live Vercel
  deployment, which builds straight from `package.json` instead.

## Logging in

At login you pick your name from the team roster (seeded in `src/db.js`)
alongside the shared passcode. That identity is tied to your session
server-side — every comment and announcement you post afterward is
attributed to you automatically. Log out and back in as someone else to
switch identities (e.g. on a shared computer).

## Brand

The login screen and sidebar header recreate the team's actual "DO(–)T"
wordmark in code (`.wordmark` / `.brand-icon` in
[public/styles.css](public/styles.css)) — there's no logo image file, it's
just styled text, so it stays crisp at any size and needs no asset to keep
in sync.

The design (redone from a Claude Design mockup the team liked) is a
permanently-dark sidebar (`--sidebar-bg` etc., the `#191a1c` family) used as
the app's real navigation, against a warm-cream light main content area
(`--bg`/`--surface`, the `#f2f2f0` family). A single gold accent (`--gold`
on the dark sidebar, `--gold-deep`/`--gold-mid` on light backgrounds)
replaces the old two-accent coral+gold system — it's reserved for small
touches (icons, links, badges, the funds bar, due/status pill fills), never
for a button's own background. Primary buttons (`.btn-primary`,
`button[type=submit]`) fill near-black (`--ink`) with white text instead.
Typography is Public Sans for body text and IBM Plex Mono for anything
meta/machine-generated — task codes, counts, timestamps, uppercase tracked
labels — both loaded from Google Fonts in `index.html`'s `<head>`. If the
team's real logo/font ever gets exported as an asset, swap it in at
`.wordmark` (login) and `.brand-icon` (sidebar) rather than keeping both in
sync by hand.

## Language

The UI is entirely in Korean — every label, button, empty state, confirm
dialog, and server-returned error message. This isn't a translated layer on
top of an English original with a toggle; the Korean text *is* the source
(in `public/index.html`, `public/app.js`, and the `error` strings in
`src/routes/*.js` / `src/middleware/requireAuth.js`). If the team ever needs
another language, that means introducing a real i18n layer (a strings file
+ a language switcher), not just re-adding English strings alongside the
Korean ones.

## Data model

- **people** — seeded list of names; shows up in the login picker, the
  assignee chip lists, and the sidebar filter.
- **tasks** — name, optional due date, notes, status
  (`TODO` / `IN_PROGRESS` / `DONE`), and a needs-help flag (powers the
  도와주세요 tab). Urgency (Overdue/Due today/Due soon/This
  week/Upcoming) is computed from `due_date` on the fly in the browser — it's
  not stored, so it's always correct for "today" without needing a job to
  update it.
- **task_assignees** — who's on a task; zero, one, or several rows per task
  (`task_id` + `person_name`). Filtering the board or the sidebar counts by a
  person matches any task they're one of the assignees on — a shared task
  isn't split or duplicated, it just shows up for everyone on it.
- **task_comments** — a discussion thread scoped to one task (author +
  message); deleted automatically when its task is deleted.
- **announcements** — `subject` + `message` + an author, not tied to any
  task. This is the whole Announcements feed — news, funding, anything worth
  telling the team, in one shared chronological list.
- **announcement_comments** — a discussion thread scoped to one announcement;
  deleted automatically when its announcement is deleted.
- **meetings** — a recurring weekly meeting: `title`, `day_of_week` (0=Sun..
  6=Sat), `time` (24h `HH:MM`). No specific date is stored — it shows up on
  the same weekday every week, indefinitely, until deleted.
- **notifications** — created automatically as a side effect, never posted
  directly: a `@mention` inside a task or announcement comment notifies that
  person (linked back to the task or announcement it came from), and every
  new announcement broadcasts to the whole team (one row per teammate).
  Read/unread, so the bell badge only counts what you haven't seen yet.
- **sessions** — now also records which teammate a session belongs to (not
  just that *someone* is logged in), which is what makes automatic authorship
  and "`@mention` *you*" possible.
- **funds** — `amount` (in **만원** units, not won — an entry of `500` means
  5,000,000원), `note` (optional), `added_by`. The sidebar bar shows
  `SUM(amount)` against a fixed 5,000만원 goal (`GOAL_MANWON` in
  `src/routes/funds.js`) — there's no UI to change the goal, it's a constant.

Comments and announcements can be deleted (a small × button appears on
hover); there's no edit-in-place, just delete and re-post.

The Resources tab is a plain external link (opens in a new tab) to the
team's Google Drive folder — it's not part of the app's own view-switching,
so it doesn't need a server route.
