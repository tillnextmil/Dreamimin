/* ============================================================
   Opens the SQLite database (Node's built-in node:sqlite),
   creates the tables from schema.sql and adds the rows every
   database starts with: the one profile, its risk preference
   and the five investment portfolios.
   ============================================================ */

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const InvestmentPortfolio = require("../src/investmentPortfolio");

/* until sign-in exists there is one user, so every request works on this profile */
const PROFILE_ID = 1;

const SCHEMA = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

/* file is a path such as data/dreamimin.db, or ":memory:" for a database that disappears on close (tests) */
function openDatabase(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  seed(db);
  return db;
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
