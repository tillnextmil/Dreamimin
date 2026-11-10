// Unit tests for the database the server creates (server/db.js and server/schema.sql):
// the rows it starts with, and the tables rejecting values the API would reject.
// Author: Aiyan Tong

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, PROFILE_ID } = require("../server/db");

let db;
beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

const insertGoal = (values) => db.prepare(`
  INSERT INTO goal (profile_id, name, target_amount, target_date, priority, min_acceptable_amount)
  VALUES (:profile, :name, :amount, :date, :priority, :min)
`).run({ profile: PROFILE_ID, name: "Car", amount: 12000, date: "2028-06-01", priority: 3, min: 0, ...values });

// normal case: a new database has the one profile, its risk preference and the five portfolios
test("starts with the profile, a risk preference of 5 and the five portfolios", () => {
  const profile = db.prepare("SELECT * FROM profile").all();
  expect(profile).toEqual([{
    profile_id: PROFILE_ID, name: "My profile", monthly_income: null, monthly_expenses: null, net_worth: 0,
  }]);
  expect(db.prepare("SELECT max_risk_level FROM risk_preference WHERE profile_id = ?").get(PROFILE_ID).max_risk_level).toBe(5);
  const names = db.prepare("SELECT name FROM investment_portfolio ORDER BY risk_level").all().map((r) => r.name);
  expect(names).toEqual(["Cautious", "Conservative", "Balanced", "Growth", "Aggressive"]);
});

// edge case: seeding again (opening an existing database) doesn't add duplicate rows
test("seeding twice doesn't duplicate rows", () => {
  const file = path.join(os.tmpdir(), `dreamimin-test-${process.pid}-${Date.now()}.db`);
  try {
    openDatabase(file).close();
    const again = openDatabase(file);
    expect(again.prepare("SELECT COUNT(*) AS n FROM profile").get().n).toBe(1);
    expect(again.prepare("SELECT COUNT(*) AS n FROM investment_portfolio").get().n).toBe(5);
    again.close();
  } finally {
    fs.rmSync(file, { force: true });
  }
});

// edge case: the smallest acceptable amount can be 0 but must stay below the goal amount
test("min_acceptable_amount must be from 0 up to less than the target amount", () => {
  expect(() => insertGoal({ min: 0 })).not.toThrow();
  expect(() => insertGoal({ min: 11999.99 })).not.toThrow();
  expect(() => insertGoal({ min: 12000 })).toThrow();
  expect(() => insertGoal({ min: -1 })).toThrow();
});

// wrong case: the goal table rejects what the API rejects
test("rejects an invalid goal", () => {
  expect(() => insertGoal({ name: "   " })).toThrow();
  expect(() => insertGoal({ name: "x".repeat(61) })).toThrow();
  expect(() => insertGoal({ amount: 0 })).toThrow();
  expect(() => insertGoal({ date: "2028-02-30" })).toThrow();
  expect(() => insertGoal({ priority: 0 })).toThrow();
  expect(() => insertGoal({ priority: 6 })).toThrow();
  expect(() => insertGoal({ profile: 99 })).toThrow();   // no such profile
});

// wrong case: spending and income/loss need a category or kind from the list
test("rejects an unknown expense category or funds event kind", () => {
  db.prepare("INSERT INTO available_funds (profile_id, balance) VALUES (?, ?)").run(PROFILE_ID, 500);
  const fundsId = db.prepare("SELECT funds_id FROM available_funds").get().funds_id;
  const expense = db.prepare("INSERT INTO expense (funds_id, amount, date, category) VALUES (?, ?, ?, ?)");
  expect(() => expense.run(fundsId, 20, "2026-10-25", "food")).not.toThrow();
  expect(() => expense.run(fundsId, 20, "2026-10-25", "snacks")).toThrow();
  const event = db.prepare("INSERT INTO funds_event (funds_id, kind, amount, date) VALUES (?, ?, ?, ?)");
  expect(() => event.run(fundsId, "income", 800, "2026-11-01")).not.toThrow();
  expect(() => event.run(fundsId, "gift", 800, "2026-11-01")).toThrow();
});

// normal case: deleting a goal deletes its results in saved plans (ON DELETE CASCADE)
test("deleting a goal deletes its goal results", () => {
  insertGoal({});
  const goalId = db.prepare("SELECT goal_id FROM goal").get().goal_id;
  const planId = db.prepare(
    "INSERT INTO plan_result (profile_id, max_risk_level, utility, dp_utility, rl_efficiency) VALUES (?, 3, 2.5, 2.7, 0.93)"
  ).run(PROFILE_ID).lastInsertRowid;
  db.prepare("INSERT INTO goal_result (plan_id, goal_id, p_full, p_partial, verdict) VALUES (?, ?, 0.6, 0.2, 'Realistic')")
    .run(planId, goalId);
  db.prepare("INSERT INTO plan_year (plan_id, year, portfolio_id) VALUES (?, 1, 3)").run(planId);

  db.prepare("DELETE FROM goal WHERE goal_id = ?").run(goalId);

  expect(db.prepare("SELECT COUNT(*) AS n FROM goal_result").get().n).toBe(0);
  expect(db.prepare("SELECT COUNT(*) AS n FROM plan_result").get().n).toBe(1);   // the plan itself stays
  expect(db.prepare("SELECT COUNT(*) AS n FROM plan_year").get().n).toBe(1);
});
