/* ============================================================
   Opens the SQLite database (Node's built-in node:sqlite),
   creates the tables from schema.sql and adds the rows every
   database starts with: the one profile, its risk preference
   and the five investment portfolios. A database file made
   before a column was added to schema.sql gets that column too.
   ============================================================ */

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const InvestmentPortfolio = require("../src/investmentPortfolio");

/* until sign-in exists there is one user, so every request works on this profile */
const PROFILE_ID = 1;

const SCHEMA = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

/* Columns added to schema.sql after the first database files were made. CREATE TABLE IF NOT
   EXISTS leaves an existing table as it is, so these are added to older files with ALTER TABLE.
   Each definition matches schema.sql (a NOT NULL column needs a default here). */
const ADDED_COLUMNS = [
  { table: "profile", column: "emergency_fund", definition: "REAL NOT NULL DEFAULT 0 CHECK (emergency_fund >= 0)" },
  { table: "available_funds", column: "entered", definition: "REAL NOT NULL DEFAULT 0 CHECK (entered >= 0)" },
];

/* file is a path such as data/dreamimin.db, or ":memory:" for a database that disappears on close (tests) */
function openDatabase(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  addMissingColumns(db);
  seed(db);
  return db;
}

/* adds any column from ADDED_COLUMNS that an older database file doesn't have yet */
function addMissingColumns(db) {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/* INSERT OR IGNORE, so opening a database that already has these rows changes nothing */
function seed(db) {
  db.prepare("INSERT OR IGNORE INTO profile (profile_id) VALUES (?)").run(PROFILE_ID);
  db.prepare("INSERT OR IGNORE INTO risk_preference (profile_id) VALUES (?)").run(PROFILE_ID);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO investment_portfolio (portfolio_id, name, risk_level, expected_return, volatility)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const p of InvestmentPortfolio.all()) {
    insert.run(p.riskLevel, p.name, p.riskLevel, p.expectedReturn, p.volatility);
  }
}

module.exports = { openDatabase, PROFILE_ID };