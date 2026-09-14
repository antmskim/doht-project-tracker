const { Router } = require("express");
const db = require("../db");
const { asyncHandler } = require("../lib/asyncHandler");

const router = Router();

// Amounts are stored and returned in 만원 (10,000-won) units, matching how
// the team talks about the goal ("5000만원") — no won-level precision needed.
const GOAL_MANWON = 5000;

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const entries = await db.all("SELECT * FROM funds ORDER BY created_at DESC LIMIT 100");
    const totalRow = await db.get("SELECT COALESCE(SUM(amount), 0) AS total FROM funds");
    res.json({ goal: GOAL_MANWON, total: totalRow.total, entries });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { amount, note } = req.body;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: "금액을 올바르게 입력해주세요." });
      return;
    }
    const result = await db.run("INSERT INTO funds (amount, note, added_by) VALUES (?, ?, ?)", [
      Math.round(amt),
      note?.trim() || null,
      req.person,
    ]);
    const entry = await db.get("SELECT * FROM funds WHERE id = ?", [
      Number(result.lastInsertRowid),
    ]);
    res.status(201).json(entry);
  })
);

module.exports = router;
