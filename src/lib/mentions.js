const db = require("../db");

// Finds every "@person" mention in a comment's text, matched against the
// real team roster (not an arbitrary @word). Longest names are checked
// first and blanked out of the working copy as they're found, so "@김영채"
// isn't misread as a mention of "김영" just because it shares a prefix. The
// author's own name is excluded (blanked out too, so it can't be mistaken
// for someone else's name in a shared prefix) — you can't ping yourself.
async function extractMentions(message, authorName) {
  const people = await db.all("SELECT name FROM people");
  const names = people.map((r) => r.name).sort((a, b) => b.length - a.length);

  let working = message;
  const mentioned = [];
  for (const name of names) {
    const token = "@" + name;
    if (working.includes(token)) {
      mentioned.push(name);
      working = working.split(token).join(" ".repeat(token.length));
    }
  }
  return mentioned.filter((name) => name !== authorName);
}

// Extracts mentions from a comment and creates a 'mention' notification for
// each one — the shared side effect of "posting a comment that @mentions
// someone", used from both task comments and announcement comments. Exactly
// one of taskId/announcementId should be set, matching whichever the
// comment belongs to.
async function notifyMentions({ message, fromPerson, taskId = null, announcementId = null }) {
  const mentioned = await extractMentions(message, fromPerson);
  if (!mentioned.length) return;
  await db.batch(
    mentioned.map((name) => ({
      sql: "INSERT INTO notifications (from_person, to_person, message, task_id, announcement_id, kind) VALUES (?, ?, ?, ?, ?, 'mention')",
      args: [fromPerson, name, message, taskId, announcementId],
    }))
  );
}

module.exports = { extractMentions, notifyMentions };
