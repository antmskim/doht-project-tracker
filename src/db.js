const path = require("node:path");
const fs = require("node:fs");
const { createClient } = require("@libsql/client");

// Local dev / no Turso configured: a plain local SQLite file (identical
// behavior to the old better-sqlite3 setup). Production sets TURSO_DATABASE_URL
// (+ TURSO_AUTH_TOKEN) to point at a real Turso database instead — same code
// either way, since @libsql/client speaks the same SQL against both.
const usingLocalFile = !process.env.TURSO_DATABASE_URL;
if (usingLocalFile) {
  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
}

const client = createClient(
  usingLocalFile
    ? { url: `file:${path.join(__dirname, "..", "data", "tracker.db")}` }
    : { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
);

async function exec(sql) {
  return client.execute(sql);
}

async function run(sql, args = []) {
  return client.execute({ sql, args });
}

async function get(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows[0];
}

async function all(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows;
}

async function tableColumns(table) {
  const rows = await all(`PRAGMA table_info(${table})`);
  return rows.map((c) => c.name);
}

// Runs multiple statements atomically — the async equivalent of
// better-sqlite3's `db.transaction(fn)`. Pass an array of { sql, args }.
async function batch(statements) {
  if (!statements.length) return;
  return client.batch(statements, "write");
}

let ready = null;

async function init() {
  if (ready) return ready;
  ready = (async () => {
    // WAL mode / foreign key enforcement only make sense for a local file —
    // Turso manages storage itself remotely, and rejects some local-only
    // pragmas, so these are best-effort and never fatal.
    try {
      await exec("PRAGMA foreign_keys = ON");
    } catch (err) {
      // ignore — not supported in this mode
    }
    if (usingLocalFile) {
      try {
        await exec("PRAGMA journal_mode = WAL");
      } catch (err) {
        // ignore
      }
    }

    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        due_date TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'TODO',
        needs_help INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS task_assignees (
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        person_name TEXT NOT NULL,
        PRIMARY KEY (task_id, person_name)
      );

      CREATE TABLE IF NOT EXISTS task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS announcement_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        day_of_week INTEGER NOT NULL,
        time TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        person_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_person TEXT NOT NULL,
        to_person TEXT NOT NULL,
        message TEXT,
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        announcement_id INTEGER REFERENCES announcements(id) ON DELETE SET NULL,
        kind TEXT NOT NULL DEFAULT 'mention',
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS funds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount INTEGER NOT NULL,
        note TEXT,
        added_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // `notifications` originally had no `announcement_id` (only pings, which
    // link to a task, existed). Add it for older databases so "new announcement"
    // broadcasts have somewhere to point.
    const notificationColumns = await tableColumns("notifications");
    if (!notificationColumns.includes("announcement_id")) {
      await exec(
        "ALTER TABLE notifications ADD COLUMN announcement_id INTEGER REFERENCES announcements(id) ON DELETE SET NULL"
      );
    }

    // `notifications` originally had no `kind` column — every row was a manual
    // "ping" sent from the (now-removed) per-comment ping button, except
    // announcement broadcasts. Add it for older databases and backfill.
    if (!notificationColumns.includes("kind")) {
      await exec("ALTER TABLE notifications ADD COLUMN kind TEXT NOT NULL DEFAULT 'ping'");
      await exec("UPDATE notifications SET kind = 'announcement' WHERE announcement_id IS NOT NULL");
    }

    // `tasks` originally had no `needs_help` flag (the 도와주세요 tab didn't
    // exist yet). Add it for older databases, defaulting existing tasks to "no".
    const taskColumnsForHelp = await tableColumns("tasks");
    if (!taskColumnsForHelp.includes("needs_help")) {
      await exec("ALTER TABLE tasks ADD COLUMN needs_help INTEGER NOT NULL DEFAULT 0");
    }

    // `announcements` originally had no `subject` column (subject+body was added
    // later). Add it for anyone with an older database, and give existing rows a
    // placeholder so they don't render with a blank headline.
    const announcementColumns = await tableColumns("announcements");
    if (!announcementColumns.includes("subject")) {
      await exec("ALTER TABLE announcements ADD COLUMN subject TEXT NOT NULL DEFAULT ''");
      await exec("UPDATE announcements SET subject = 'Update' WHERE subject = ''");
    }

    // Older versions of this app had per-task comment threads in an `updates`
    // table. That feature is gone; fold any existing rows into the flat
    // announcements feed (as general posts, no longer tied to a task) and drop
    // the old table.
    const hasOldUpdatesTable = await get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'updates'"
    );
    if (hasOldUpdatesTable) {
      const oldUpdates = await all("SELECT author, message, created_at FROM updates ORDER BY id");
      if (oldUpdates.length) {
        await client.batch(
          oldUpdates.map((row) => ({
            sql: "INSERT INTO announcements (author, message, created_at) VALUES (?, ?, ?)",
            args: [row.author, row.message, row.created_at],
          })),
          "write"
        );
      }
      await exec("DROP TABLE updates");
    }

    // The "Waiting on Reply" column was removed. Anything still sitting in it
    // moves to In Progress rather than vanishing from the board.
    await exec("UPDATE tasks SET status = 'IN_PROGRESS' WHERE status = 'WAITING'");

    // `sessions` originally had no `person_name` (login used to be passcode-only;
    // "who's posting" was picked per-action instead). Add the column for older
    // databases, and clear existing sessions so everyone re-logs-in and picks
    // who they are — a session without a person_name can't be trusted for
    // authorship or notifications.
    const sessionColumns = await tableColumns("sessions");
    if (!sessionColumns.includes("person_name")) {
      await exec("ALTER TABLE sessions ADD COLUMN person_name TEXT");
    }
    await exec("DELETE FROM sessions WHERE person_name IS NULL");

    // Tasks used to have a single `assignee` text column (one person per task).
    // Multi-assign replaced it with `task_assignees` (one row per task/person
    // pair). For anyone upgrading from that era: fold each task's existing
    // `assignee` into `task_assignees` before dropping the column, so no
    // existing assignments are lost.
    const taskColumns = await tableColumns("tasks");
    if (taskColumns.includes("assignee")) {
      const tasksWithAssignee = await all(
        "SELECT id, assignee FROM tasks WHERE assignee IS NOT NULL AND assignee != ''"
      );
      if (tasksWithAssignee.length) {
        await client.batch(
          tasksWithAssignee.map((row) => ({
            sql: "INSERT OR IGNORE INTO task_assignees (task_id, person_name) VALUES (?, ?)",
            args: [row.id, row.assignee],
          })),
          "write"
        );
      }
      await exec("ALTER TABLE tasks DROP COLUMN assignee");
    }

    const SEED_PEOPLE = [
      "김영",
      "김민서",
      "Mina",
      "Francheska",
      "David",
      "지효",
      "Karrie",
      "박영웅",
      "김영채",
      "류이브",
      "박지윤",
    ];
    await client.batch(
      SEED_PEOPLE.map((name) => ({
        sql: "INSERT OR IGNORE INTO people (name) VALUES (?)",
        args: [name],
      })),
      "write"
    );
  })();
  return ready;
}

module.exports = { client, init, exec, run, get, all, tableColumns, batch };
