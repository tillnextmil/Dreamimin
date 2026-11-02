// Unit tests for saving the five investment portfolios in an SQL table (SQLite)
// and reading them back with SELECT queries.
// Author: Autiana Wallace

const { DatabaseSync } = require("node:sqlite");
const InvestmentPortfolio = require("../src/investmentPortfolio");

// A fresh database in memory for each test, with the investment_portfolio table
// from our ER diagram, filled with the five portfolios.
let db;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE investment_portfolio (
      portfolio_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      risk_level INTEGER NOT NULL CHECK (risk_level BETWEEN 1 AND 5),
      expected_return REAL NOT NULL,
      volatility REAL NOT NULL CHECK (volatility >= 0)
    );
  `);
  const insert = db.prepare(
    "INSERT INTO investment_portfolio (name, risk_level, expected_return, volatility) VALUES (?, ?, ?, ?)"
  );
  for (const p of InvestmentPortfolio.all()) {
    insert.run(p.name, p.riskLevel, p.expectedReturn, p.volatility);
  }
});

afterEach(() => {
  db.close();
});

// normal case: all five portfolios are saved, each with its own id
test("saves all five portfolios", () => {
  const row = db.prepare("SELECT COUNT(*) AS total FROM investment_portfolio").get();
  expect(row.total).toBe(5);
  const ids = db.prepare("SELECT portfolio_id FROM investment_portfolio ORDER BY portfolio_id").all();
  expect(ids.map((r) => r.portfolio_id)).toEqual([1, 2, 3, 4, 5]);
});

// normal case: a portfolio read back from the table has the same values that were saved
test("reads a portfolio back with the same values", () => {
  const row = db.prepare("SELECT * FROM investment_portfolio WHERE name = ?").get("Balanced");
  expect(row.risk_level).toBe(3);
  expect(row.expected_return).toBe(0.037);
  expect(row.volatility).toBe(0.115);
});

// normal case: sorting by volatility gives the portfolios from lowest to highest risk
test("lists portfolios from lowest to highest risk", () => {
  const rows = db.prepare("SELECT name FROM investment_portfolio ORDER BY volatility").all();
  expect(rows.map((r) => r.name)).toEqual(["Cautious", "Conservative", "Balanced", "Growth", "Aggressive"]);
});

// normal case: WHERE finds only the portfolios that can rise or fall by more than 10%
test("finds the portfolios with volatility above 10%", () => {
  const rows = db.prepare("SELECT name FROM investment_portfolio WHERE volatility > 0.10 ORDER BY risk_level").all();
  expect(rows.map((r) => r.name)).toEqual(["Balanced", "Growth", "Aggressive"]);
});

// normal case: AVG, MIN and MAX work on the expected returns
test("works out the average, lowest and highest expected return", () => {
  const row = db.prepare(
    "SELECT AVG(expected_return) AS avg_return, MIN(expected_return) AS min_return, MAX(expected_return) AS max_return FROM investment_portfolio"
  ).get();
  expect(row.avg_return).toBeCloseTo(0.0362);   // (1.5 + 2.5 + 3.7 + 4.7 + 5.7) / 5 = 3.62%
  expect(row.min_return).toBe(0.015);
  expect(row.max_return).toBe(0.057);
});

// edge case: a risk level that doesn't exist finds nothing
test("finds nothing for a risk level that doesn't exist", () => {
  const row = db.prepare("SELECT * FROM investment_portfolio WHERE risk_level = ?").get(6);
  expect(row).toBeUndefined();
});

// wrong case: the table rejects a risk level outside 1 to 5, a negative volatility and a duplicate name
test("rejects invalid rows", () => {
  const insert = db.prepare(
    "INSERT INTO investment_portfolio (name, risk_level, expected_return, volatility) VALUES (?, ?, ?, ?)"
  );
  expect(() => insert.run("Too risky", 6, 0.07, 0.25)).toThrow();
  expect(() => insert.run("Impossible", 3, 0.03, -0.1)).toThrow();
  expect(() => insert.run("Balanced", 3, 0.037, 0.115)).toThrow();
  const row = db.prepare("SELECT COUNT(*) AS total FROM investment_portfolio").get();
  expect(row.total).toBe(5);
});