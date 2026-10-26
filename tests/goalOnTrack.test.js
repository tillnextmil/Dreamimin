// Unit tests for FinancialGoal: whether a monthly amount is on track, and how long it takes.
// Author: Jessica Chang

const FinancialGoal = require("../src/financialGoal");

// Fixed date so results never depend on when the tests run.
// $1,200 due April 15 from January 15 is 3 months, so $400 a month is required.
const TODAY = new Date(2099, 0, 15);
const REQUIRED = 400;

function goal() {
  return new FinancialGoal({ targetAmount: 1200, targetDate: "2099-04-15" });
}

// normal case: saving exactly the required amount is on track
test("is on track when saving exactly the required amount", () => {
  expect(goal().isOnTrack(REQUIRED, TODAY)).toBe(true);
  expect(goal().monthsToReach(REQUIRED)).toBe(3);
});

// wrong case: one cent short is not on track and takes an extra month
test("is not on track when saving just short of the required amount", () => {
  expect(goal().isOnTrack(REQUIRED - 0.01, TODAY)).toBe(false);
  expect(goal().monthsToReach(REQUIRED - 0.01)).toBe(4);
});

// edge case: spending more than earning never reaches the goal
test("is never on track with a negative surplus", () => {
  expect(goal().isOnTrack(-100, TODAY)).toBe(false);
  expect(goal().monthsToReach(-100)).toBe(Infinity);
});

// edge case: saving nothing never reaches the goal
test("is never on track with a zero surplus", () => {
  expect(goal().isOnTrack(0, TODAY)).toBe(false);
  expect(goal().monthsToReach(0)).toBe(Infinity);
});
