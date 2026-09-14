const crypto = require("node:crypto");
const { Router } = require("express");
const db = require("../db");
const { SESSION_COOKIE } = require("../middleware/requireAuth");
const { asyncHandler } = require("../lib/asyncHandler");

const router = Router();

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { passcode, name } = req.body;
    const expected = process.env.APP_PASSCODE;
    if (!expected) {
      res.status(500).json({ error: "서버에 APP_PASSCODE가 설정되어 있지 않습니다." });
      return;
    }
    if (typeof passcode !== "string" || !timingSafeEqual(passcode, expected)) {
      res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
      return;
    }
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "본인을 선택해주세요." });
      return;
    }
    const person = await db.get("SELECT name FROM people WHERE name = ?", [name]);
    if (!person) {
      res.status(400).json({ error: "등록되지 않은 팀원입니다." });
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    await db.run("INSERT INTO sessions (token, person_name) VALUES (?, ?)", [token, name]);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
    res.json({ ok: true, name });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      await db.run("DELETE FROM sessions WHERE token = ?", [token]);
    }
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  })
);

router.get(
  "/session",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const session = token
      ? await db.get("SELECT person_name FROM sessions WHERE token = ?", [token])
      : null;
    res.json({ loggedIn: Boolean(session), name: session?.person_name ?? null });
  })
);

module.exports = router;
