const { Router } = require("express");
const db = require("../db");
const { asyncHandler } = require("../lib/asyncHandler");

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const people = await db.all("SELECT id, name FROM people ORDER BY name");
    res.json(people);
  })
);

module.exports = router;
