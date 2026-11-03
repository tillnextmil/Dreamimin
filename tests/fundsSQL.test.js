// Unit tests for saving available funds and recorded spending in SQL tables (SQLite)
// and reading them back with SELECT queries.
// Author: Autiana Wallace

const { DatabaseSync } = require("node:sqlite");
const AvailableFunds = require("../src/availableFunds");

// Stands in for an Expense (src/expense.js): an id, an amount, a date and a note.
function spending(id, amount, date, note = "") {
  return Object.freeze({ id, amount, date, note });
}

// A fresh database in memory for each test, with the available_funds and expense tables
// from our ER diagram, filled from an AvailableFunds that started at $2,000.
let db, funds;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE available_funds (
      funds_id INTEGER PRIMARY KEY,
      balance REAL NOT NULL CHECK (balance >= 0)
    );
    CREATE TABLE expense (
      expense_id INTEGER PRIMARY KEY,
      funds_id INTEGER NOT NULL REFERENCES available_funds (funds_id),
      amount REAL NOT NULL CHECK (amount > 0),
      date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 60)
    );
  `);

  funds = new AvailableFunds({ balance: 2000 });
  funds.recordSpending(spending(1, 120, "2026-10-03", "Groceries"));
  funds.recordSpending(spending(2, 45.5, "2026-10-12", "Gas"));
  funds.recordSpending(spending(3, 300, "2026-10-20", "Concert tickets"));

  db.prepare("INSERT INTO available_funds (funds_id, balance) VALUES (?, ?)").run(1, funds.balance);
  const insert = db.prepare("INSERT INTO expense (expense_id, funds_id, amount, date, note) VALUES (?, ?, ?, ?, ?)");
  for (const e of funds.expenses) {
    insert.run(e.id, 1, e.amount, e.date, e.note);
  }
});

afterEach(() => {
  db.close();
});

// normal case: the funds and all three spendings are saved
test("saves the funds and each recorded spending", () => {
  expect(db.prepare("SELECT balance FROM available_funds WHERE funds_id = ?").get(1).balance).toBe(1534.5);
  expect(db.prepare("SELECT COUNT(*) AS total FROM expense").get().total).toBe(3);
});

// normal case: SUM of the saved spending matches the class, and adding it back gives the starting funds
test("the saved spending adds up to what the class recorded", () => {
  const row = db.prepare(`
    SELECT f.balance, SUM(e.amount) AS spent
    FROM available_funds f
    JOIN expense e ON e.funds_id = f.funds_id
    WHERE f.funds_id = ?
    GROUP BY f.funds_id
  `).get(1);
  expect(row.spent).toBeCloseTo(funds.totalSpent);
  expect(row.balance + row.spent).toBeCloseTo(2000);
});

// normal case: ORDER BY date lists the spending oldest first, like the class does
test("lists spending oldest first", () => {
  const rows = db.prepare("SELECT note FROM expense ORDER BY date").all();
  expect(rows.map((r) => r.note)).toEqual(["Groceries", "Gas", "Concert tickets"]);
});

// normal case: WHERE finds the spending over $100
test("finds the spending over $100", () => {
  const rows = db.prepare("SELECT note FROM expense WHERE amount > 100 ORDER BY amount DESC").all();
  expect(rows.map((r) => r.note)).toEqual(["Concert tickets", "Groceries"]);
});

// normal case: deleting a spending (like removeSpending) lowers the total
test("deleting a spending lowers the total spent", () => {
  db.prepare("DELETE FROM expense WHERE expense_id = ?").run(3);
  const row = db.prepare("SELECT SUM(amount) AS spent FROM expense WHERE funds_id = ?").get(1);
  expect(row.spent).toBeCloseTo(165.5);
});

// edge case: funds with no spending recorded have no expense rows
test("new funds have no spending", () => {
  db.prepare("INSERT INTO available_funds (funds_id, balance) VALUES (?, ?)").run(2, 500);
  const row = db.prepare("SELECT COUNT(*) AS total FROM expense WHERE funds_id = ?").get(2);
  expect(row.total).toBe(0);
});

// wrong case: the tables reject negative funds, spending of $0 or less, and a note over 60 characters
test("rejects invalid funds and spending", () => {
  expect(() => db.prepare("INSERT INTO available_funds (balance) VALUES (?)").run(-1)).toThrow();
  const insert = db.prepare("INSERT INTO expense (funds_id, amount, date, note) VALUES (?, ?, ?, ?)");
  expect(() => insert.run(1, 0, "2026-10-25", "")).toThrow();
  expect(() => insert.run(1, -20, "2026-10-25", "")).toThrow();
  expect(() => insert.run(1, 20, "2026-10-25", "x".repeat(61))).toThrow();
  expect(() => insert.run(1, 20, "2026-10-25", "x".repeat(60))).not.toThrow();
});

// wrong case: spending must belong to funds that exist (the foreign key)
test("rejects spending for funds that don't exist", () => {
  const insert = db.prepare("INSERT INTO expense (funds_id, amount, date, note) VALUES (?, ?, ?, ?)");
  expect(() => insert.run(99, 20, "2026-10-25", "")).toThrow();
  expect(db.prepare("SELECT COUNT(*) AS total FROM expense").get().total).toBe(3);
});