const { Router } = require("express");
const db = require("../db");
const { asyncHandler } = require("../lib/asyncHandler");

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const notifications = await db.all(
      `SELECT notifications.*, tasks.name AS task_name, announcements.subject AS announcement_subject
       FROM notifications
       LEFT JOIN tasks ON tasks.id = notifications.task_id
       LEFT JOIN announcements ON announcements.id = notifications.announcement_id
       WHERE to_person = ?
       ORDER BY notifications.created_at DESC
       LIMIT 100`,
      [req.person]
    );
    res.json(notifications);
  })
);

router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const row =
      req.query.type === "announcement"
        ? await db.get(
            "SELECT COUNT(*) AS count FROM notifications WHERE to_person = ? AND read = 0 AND announcement_id IS NOT NULL",
            [req.person]
          )
        : await db.get(
            "SELECT COUNT(*) AS count FROM notifications WHERE to_person = ? AND read = 0",
            [req.person]
          );
    res.json({ count: row.count });
  })
);

router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await db.run("UPDATE notifications SET read = 1 WHERE to_person = ? AND read = 0", [
      req.person,
    ]);
    res.json({ ok: true });
  })
);

module.exports = router;
