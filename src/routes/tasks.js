const { Router } = require("express");
const db = require("../db");
const { notifyMentions } = require("../lib/mentions");
const { asyncHandler } = require("../lib/asyncHandler");

const router = Router();

const STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);

async function getAssignees(taskId) {
  const rows = await db.all(
    "SELECT person_name FROM task_assignees WHERE task_id = ? ORDER BY person_name",
    [taskId]
  );
  return rows.map((r) => r.person_name);
}

async function withAssignees(task) {
  if (!task) return task;
  return {
    ...task,
    assignees: await getAssignees(task.id),
    needs_help: Boolean(task.needs_help),
  };
}

async function setAssignees(taskId, assignees) {
  const unique = [...new Set((assignees || []).map((a) => String(a).trim()).filter(Boolean))];
  await db.batch([
    { sql: "DELETE FROM task_assignees WHERE task_id = ?", args: [taskId] },
    ...unique.map((name) => ({
      sql: "INSERT INTO task_assignees (task_id, person_name) VALUES (?, ?)",
      args: [taskId, name],
    })),
  ]);
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { assignee, needs_help } = req.query;
    const conditions = [];
    const params = [];
    if (assignee === "__unassigned__") {
      conditions.push("id NOT IN (SELECT task_id FROM task_assignees)");
    } else if (assignee) {
      conditions.push("id IN (SELECT task_id FROM task_assignees WHERE person_name = ?)");
      params.push(assignee);
    }
    if (needs_help === "1") {
      conditions.push("needs_help = 1");
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const tasks = await db.all(`SELECT * FROM tasks ${where} ORDER BY created_at DESC`, params);
    res.json(await Promise.all(tasks.map(withAssignees)));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await db.get("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    if (!task) {
      res.status(404).json({ error: "작업을 찾을 수 없습니다." });
      return;
    }
    res.json(await withAssignees(task));
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, assignees, due_date, notes, status, needs_help } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "작업 이름을 입력해주세요." });
      return;
    }
    const finalStatus = STATUSES.has(status) ? status : "TODO";
    const result = await db.run(
      `INSERT INTO tasks (name, due_date, notes, status, needs_help)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), due_date || null, notes || null, finalStatus, needs_help ? 1 : 0]
    );
    const taskId = Number(result.lastInsertRowid);
    await setAssignees(taskId, assignees);
    const task = await db.get("SELECT * FROM tasks WHERE id = ?", [taskId]);
    res.status(201).json(await withAssignees(task));
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await db.get("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: "작업을 찾을 수 없습니다." });
      return;
    }
    const { name, assignees, due_date, notes, status, needs_help } = req.body;
    if (status !== undefined && !STATUSES.has(status)) {
      res.status(400).json({ error: "올바르지 않은 상태 값입니다." });
      return;
    }
    await db.run(
      `UPDATE tasks SET
         name = ?,
         due_date = ?,
         notes = ?,
         status = ?,
         needs_help = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
      [
        name !== undefined ? name.trim() : existing.name,
        due_date !== undefined ? due_date || null : existing.due_date,
        notes !== undefined ? notes || null : existing.notes,
        status !== undefined ? status : existing.status,
        needs_help !== undefined ? (needs_help ? 1 : 0) : existing.needs_help,
        req.params.id,
      ]
    );
    if (assignees !== undefined) {
      await setAssignees(req.params.id, assignees);
    }
    const task = await db.get("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    res.json(await withAssignees(task));
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await db.run("DELETE FROM tasks WHERE id = ?", [req.params.id]);
    res.status(204).send();
  })
);

router.get(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const comments = await db.all(
      "SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json(comments);
  })
);

router.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
      res.status(400).json({ error: "내용을 입력해주세요." });
      return;
    }
    const task = await db.get("SELECT id FROM tasks WHERE id = ?", [req.params.id]);
    if (!task) {
      res.status(404).json({ error: "작업을 찾을 수 없습니다." });
      return;
    }
    const trimmedMessage = message.trim();
    const result = await db.run(
      "INSERT INTO task_comments (task_id, author, message) VALUES (?, ?, ?)",
      [req.params.id, req.person, trimmedMessage]
    );
    await notifyMentions({ message: trimmedMessage, fromPerson: req.person, taskId: req.params.id });
    const comment = await db.get("SELECT * FROM task_comments WHERE id = ?", [
      Number(result.lastInsertRowid),
    ]);
    res.status(201).json(comment);
  })
);

router.delete(
  "/:id/comments/:commentId",
  asyncHandler(async (req, res) => {
    await db.run("DELETE FROM task_comments WHERE id = ? AND task_id = ?", [
      req.params.commentId,
      req.params.id,
    ]);
    res.status(204).send();
  })
);

module.exports = router;
