const { Router } = require("express");
const db = require("../db");
const { notifyMentions } = require("../lib/mentions");
const { asyncHandler } = require("../lib/asyncHandler");

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const announcements = await db.all(
      "SELECT * FROM announcements ORDER BY created_at DESC LIMIT 200"
    );
    res.json(announcements);
  })
);

async function notifyEveryoneOfAnnouncement(announcementId, poster) {
  const recipients = await db.all("SELECT name FROM people WHERE name != ?", [poster]);
  if (!recipients.length) return;
  await db.batch(
    recipients.map(({ name }) => ({
      sql: "INSERT INTO notifications (from_person, to_person, announcement_id, kind) VALUES (?, ?, ?, 'announcement')",
      args: [poster, name, announcementId],
    }))
  );
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { subject, message } = req.body;
    if (!subject || !subject.trim() || !message || !message.trim()) {
      res.status(400).json({ error: "제목과 내용을 입력해주세요." });
      return;
    }
    const result = await db.run(
      "INSERT INTO announcements (subject, author, message) VALUES (?, ?, ?)",
      [subject.trim(), req.person, message.trim()]
    );
    const announcementId = Number(result.lastInsertRowid);
    await notifyEveryoneOfAnnouncement(announcementId, req.person);
    const announcement = await db.get("SELECT * FROM announcements WHERE id = ?", [
      announcementId,
    ]);
    res.status(201).json(announcement);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await db.run("DELETE FROM announcements WHERE id = ?", [req.params.id]);
    res.status(204).send();
  })
);

router.get(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const comments = await db.all(
      "SELECT * FROM announcement_comments WHERE announcement_id = ? ORDER BY created_at ASC",
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
    const announcement = await db.get("SELECT id FROM announcements WHERE id = ?", [
      req.params.id,
    ]);
    if (!announcement) {
      res.status(404).json({ error: "공지사항을 찾을 수 없습니다." });
      return;
    }
    const trimmedMessage = message.trim();
    const result = await db.run(
      "INSERT INTO announcement_comments (announcement_id, author, message) VALUES (?, ?, ?)",
      [req.params.id, req.person, trimmedMessage]
    );
    await notifyMentions({
      message: trimmedMessage,
      fromPerson: req.person,
      announcementId: req.params.id,
    });
    const comment = await db.get("SELECT * FROM announcement_comments WHERE id = ?", [
      Number(result.lastInsertRowid),
    ]);
    res.status(201).json(comment);
  })
);

router.delete(
  "/:id/comments/:commentId",
  asyncHandler(async (req, res) => {
    await db.run("DELETE FROM announcement_comments WHERE id = ? AND announcement_id = ?", [
      req.params.commentId,
      req.params.id,
    ]);
    res.status(204).send();
  })
);

module.exports = router;
