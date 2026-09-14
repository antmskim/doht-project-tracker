const db = require("../db");
const { asyncHandler } = require("../lib/asyncHandler");

const SESSION_COOKIE = "tracker_session";

const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  const session = await db.get("SELECT token, person_name FROM sessions WHERE token = ?", [
    token,
  ]);
  if (!session || !session.person_name) {
    res.status(401).json({ error: "세션이 만료되었습니다. 다시 로그인해주세요." });
    return;
  }
  req.person = session.person_name;
  next();
});

module.exports = { requireAuth, SESSION_COOKIE };
