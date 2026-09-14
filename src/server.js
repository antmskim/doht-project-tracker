require("dotenv").config();
const app = require("./app");
const db = require("./db");

const port = process.env.PORT || 3000;

db.init()
  .then(() => {
    app.listen(port, () => {
      console.log(`Project tracker listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
