const { Router } = require("express");
const db = require("../db");
const { asyncHandler } = require("../lib/asyncHandler");

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const meetings = await db.all("SELECT * FROM meetings ORDER BY day_of_week ASC, time ASC");
    res.json(meetings);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { title, day_of_week, time } = req.body;
    const dayOfWeek = Number(day_of_week);
    if (!title || !title.trim()) {
      res.status(400).json({ error: "제목을 입력해주세요." });
      return;
    }
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      res.status(400).json({ error: "요일 값이 올바르지 않습니다." });
      return;
    }
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      res.status(400).json({ error: "시간 형식이 올바르지 않습니다 (HH:MM)." });
      return;
    }
    const result = await db.run(
      "INSERT INTO meetings (title, day_of_week, time) VALUES (?, ?, ?)",
      [title.trim(), dayOfWeek, time]
    );
    const meeting = await db.get("SELECT * FROM meetings WHERE id = ?", [
      Number(result.lastInsertRowid),
    ]);
    res.status(201).json(meeting);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await db.run("DELETE FROM meetings WHERE id = ?", [req.params.id]);
    res.status(204).send();
  })
);

module.exports = router;
