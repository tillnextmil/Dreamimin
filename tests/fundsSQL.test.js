// Unit tests for saving available funds and recorded spending in SQL tables (SQLite)
// and reading them back with SELECT queries.
// Author: Autiana Wallace

const { openDatabase, PROFILE_ID } = require("../server/db");
const AvailableFunds = require("../src/availableFunds");

// Stands in for an Expense (src/expense.js): an id, an amount, a date, a note and a category.
function spending(id, amount, date, note = "", category = "other") {
  return Object.freeze({ id, amount, date, note, category });
}

// A fresh database in memory for each test, made the same way the server makes it
// (server/db.js runs server/schema.sql), so these tests check the real available_funds
// and expense tables. They are filled from an AvailableFunds that started at $2,000.
let db, funds;
beforeEach(() => {
  db = openDatabase(":memory:");

  funds = new AvailableFunds({ balance: 2000 });
  funds.recordSpending(spending(1, 120, "2026-10-03", "Groceries", "food"));
  funds.recordSpending(spending(2, 45.5, "2026-10-12", "Gas", "transport"));
  funds.recordSpending(spending(3, 300, "2026-10-20", "Concert tickets", "fun"));

  db.prepare("INSERT INTO available_funds (funds_id, profile_id, balance) VALUES (?, ?, ?)").run(1, PROFILE_ID, funds.balance);
  const insert = db.prepare(
    "INSERT INTO expense (expense_id, funds_id, amount, date, note, category) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const e of funds.expenses) {
    insert.run(e.id, 1, e.amount, e.date, e.note, e.category);
  }
});

afterEach(() => {
  db.close();
});

// a second profile, for tests that need funds of their own
function addProfile(profileId) {
  db.prepare("INSERT INTO profile (profile_id) VALUES (?)").run(profileId);
}

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

// normal case: WHERE category finds the spending in one category, and GROUP BY totals each category
test("finds and totals spending by category", () => {
  const food = db.prepare("SELECT note FROM expense WHERE category = ?").all("food");
  expect(food.map((r) => r.note)).toEqual(["Groceries"]);
  const totals = db.prepare("SELECT category, SUM(amount) AS total FROM expense GROUP BY category ORDER BY category").all();
  expect(totals.map((r) => [r.category, r.total])).toEqual([["food", 120], ["fun", 300], ["transport", 45.5]]);
});

// normal case: deleting a spending (like removeSpending) lowers the total
test("deleting a spending lowers the total spent", () => {
  db.prepare("DELETE FROM expense WHERE expense_id = ?").run(3);
  const row = db.prepare("SELECT SUM(amount) AS spent FROM expense WHERE funds_id = ?").get(1);
  expect(row.spent).toBeCloseTo(165.5);
});

// edge case: spending saved without a category gets "other"
test("spending saved without a category is \"other\"", () => {
  db.prepare("INSERT INTO expense (expense_id, funds_id, amount, date) VALUES (?, ?, ?, ?)").run(4, 1, 10, "2026-10-25");
  expect(db.prepare("SELECT category FROM expense WHERE expense_id = ?").get(4).category).toBe("other");
});

// edge case: funds with no spending recorded have no expense rows
test("new funds have no spending", () => {
  addProfile(2);
  db.prepare("INSERT INTO available_funds (funds_id, profile_id, balance) VALUES (?, ?, ?)").run(2, 2, 500);
  const row = db.prepare("SELECT COUNT(*) AS total FROM expense WHERE funds_id = ?").get(2);
  expect(row.total).toBe(0);
});

// edge case: deleting the funds deletes their spending too (ON DELETE CASCADE)
test("deleting the funds deletes their spending", () => {
  db.prepare("DELETE FROM available_funds WHERE funds_id = ?").run(1);
  expect(db.prepare("SELECT COUNT(*) AS total FROM expense").get().total).toBe(0);
});

// wrong case: a profile has only one set of funds
test("rejects a second set of funds for the same profile", () => {
  const insert = db.prepare("INSERT INTO available_funds (profile_id, balance) VALUES (?, ?)");
  expect(() => insert.run(PROFILE_ID, 100)).toThrow();
  expect(db.prepare("SELECT COUNT(*) AS total FROM available_funds").get().total).toBe(1);
});

// wrong case: the tables reject negative funds, spending of $0 or less, and a note over 60 characters
test("rejects invalid funds and spending", () => {
  addProfile(2);
  expect(() => db.prepare("INSERT INTO available_funds (profile_id, balance) VALUES (?, ?)").run(2, -1)).toThrow();
  const insert = db.prepare("INSERT INTO expense (funds_id, amount, date, note) VALUES (?, ?, ?, ?)");
  expect(() => insert.run(1, 0, "2026-10-25", "")).toThrow();
  expect(() => insert.run(1, -20, "2026-10-25", "")).toThrow();
  expect(() => insert.run(1, 20, "2026-10-25", "x".repeat(61))).toThrow();
  expect(() => insert.run(1, 20, "2026-10-25", "x".repeat(60))).not.toThrow();
});

// wrong case: a category that isn't on the list is rejected, including a different capitalization
test.each(["pizza", "Food", ""])("rejects the category %p", (category) => {
  const insert = db.prepare("INSERT INTO expense (funds_id, amount, date, category) VALUES (?, ?, ?, ?)");
  expect(() => insert.run(1, 20, "2026-10-25", category)).toThrow();
  expect(db.prepare("SELECT COUNT(*) AS total FROM expense").get().total).toBe(3);
});

// wrong case: spending must belong to funds that exist (the foreign key)
test("rejects spending for funds that don't exist", () => {
  const insert = db.prepare("INSERT INTO expense (funds_id, amount, date, note) VALUES (?, ?, ?, ?)");
  expect(() => insert.run(99, 20, "2026-10-25", "")).toThrow();
  expect(db.prepare("SELECT COUNT(*) AS total FROM expense").get().total).toBe(3);
});