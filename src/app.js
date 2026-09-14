const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");

const db = require("./db");
const { requireAuth } = require("./middleware/requireAuth");
const authRouter = require("./routes/auth");
const peopleRouter = require("./routes/people");
const tasksRouter = require("./routes/tasks");
const announcementsRouter = require("./routes/announcements");
const meetingsRouter = require("./routes/meetings");
const notificationsRouter = require("./routes/notifications");
const fundsRouter = require("./routes/funds");

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

// Every API request waits for the (memoized) DB init/migration pass to
// finish first — cheap after the first call, but required before any query
// can run. This matters most on Vercel: each cold start needs this to
// complete before handling its first request, and db.init() caches its
// promise so warm invocations skip straight through.
app.use((req, res, next) => {
  db.init().then(() => next(), next);
});

app.use("/api/auth", authRouter);
// Public (no requireAuth): the login screen needs the team roster before
// anyone is authenticated, to let people pick who they are.
app.use("/api/people", peopleRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
app.use("/api/announcements", requireAuth, announcementsRouter);
app.use("/api/meetings", requireAuth, meetingsRouter);
app.use("/api/notifications", requireAuth, notificationsRouter);
app.use("/api/funds", requireAuth, fundsRouter);

// Centralized error handler — asyncHandler forwards any rejected promise
// from a route handler here instead of leaving the request hanging.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

module.exports = app;
