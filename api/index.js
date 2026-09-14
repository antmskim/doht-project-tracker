// Vercel serverless entry point. This just hands Vercel the same Express
// app used locally (src/app.js) — Express apps are valid Node request
// handlers, so no adapter is needed. Local dev uses src/server.js instead,
// which wraps this same app with app.listen() and dotenv loading.
module.exports = require("../src/app");
