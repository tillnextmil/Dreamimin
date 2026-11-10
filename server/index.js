/* ============================================================
   Starts the server (`npm start`): opens the database file and
   serves the page and the API at http://localhost:3000.
   PORT and DB_FILE can be set to change either.
   ============================================================ */

const path = require("node:path");
const { openDatabase } = require("./db");
const { createApp } = require("./app");

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "..", "data", "dreamimin.db");

const db = openDatabase(DB_FILE);
createApp({ db }).listen(PORT, () => {
  console.log(`Dreamimin is running at http://localhost:${PORT} (data in ${DB_FILE})`);
});
