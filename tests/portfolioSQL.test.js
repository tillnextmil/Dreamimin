// Unit tests for the investment_portfolio table (SQLite): the five portfolios the server
// saves, reading them back with SELECT queries, and the table rejecting invalid values.
// Author: Autiana Wallace

const { openDatabase } = require("../server/db");
const InvestmentPortfolio = require("../src/investmentPortfolio");

// A fresh database in memory for each test, made the same way the server makes it
// (server/db.js runs server/schema.sql and saves the five portfolios), so these tests
// check the real table the server uses.
let db;
beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

// normal case: all five portfolios are saved, each with its risk level as its id
test("saves all five portfolios", () => {
  const row = db.prepare("SELECT COUNT(*) AS total FROM investment_portfolio").get();
  expect(row.total).toBe(5);
  const ids = db.prepare("SELECT portfolio_id FROM investment_portfolio ORDER BY portfolio_id").all();
  expect(ids.map((r) => r.portfolio_id)).toEqual([1, 2, 3, 4, 5]);
});

// normal case: every saved portfolio has the same values as the class
test("the saved portfolios match InvestmentPortfolio", () => {
  const rows = db.prepare("SELECT * FROM investment_portfolio ORDER BY risk_level").all();
  expect(rows.map((r) => ({
    riskLevel: r.risk_level, name: r.name, expectedReturn: r.expected_return, volatility: r.volatility,
  }))).toEqual(InvestmentPortfolio.all().map((p) => ({
    riskLevel: p.riskLevel, name: p.name, expectedReturn: p.expectedReturn, volatility: p.volatility,
  })));
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

// wrong case: a sixth portfolio with a risk level outside 1 to 5 is rejected
test("rejects a portfolio with a risk level outside 1 to 5", () => {
  const insert = db.prepare(
    "INSERT INTO investment_portfolio (name, risk_level, expected_return, volatility) VALUES (?, ?, ?, ?)"
  );
  expect(() => insert.run("Too risky", 6, 0.07, 0.25)).toThrow();
  expect(() => insert.run("Too safe", 0, 0.01, 0.01)).toThrow();
  expect(db.prepare("SELECT COUNT(*) AS total FROM investment_portfolio").get().total).toBe(5);
});

// wrong case: the table rejects a negative volatility, a name that's already used and a
// risk level that's already used, and leaves the portfolios as they were
test("rejects invalid changes to a portfolio", () => {
  const update = (sql) => () => db.prepare(sql).run();
  expect(update("UPDATE investment_portfolio SET volatility = -0.1 WHERE name = 'Balanced'")).toThrow();
  expect(update("UPDATE investment_portfolio SET name = 'Balanced' WHERE name = 'Growth'")).toThrow();
  expect(update("UPDATE investment_portfolio SET risk_level = 3 WHERE name = 'Growth'")).toThrow();
  expect(db.prepare("SELECT volatility FROM investment_portfolio WHERE name = 'Balanced'").get().volatility).toBe(0.115);
  expect(db.prepare("SELECT risk_level FROM investment_portfolio WHERE name = 'Growth'").get().risk_level).toBe(4);
});