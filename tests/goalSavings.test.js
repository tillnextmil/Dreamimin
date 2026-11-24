// Unit tests for FinancialGoal with money already saved: the goal check in step 2 counts it,
// as the chances in step 3 do, so the two steps agree.
// Author: Aiyan Tong

const FinancialGoal = require("../src/financialGoal");

// Fixed date so results never depend on when the tests run.
// $1,200 due April 15 from January 15 is 3 months.
const TODAY = new Date(2099, 0, 15);

function goal() {
  return new FinancialGoal({ targetAmount: 1200, targetDate: "2099-04-15" });
}

// normal case: money already saved lowers what's needed each month
test("counts savings toward the monthly amount needed", () => {
  expect(goal().monthlySavingsRequired(TODAY, 600)).toBe(200);
  expect(goal().isOnTrack(200, TODAY, 600)).toBe(true);
  expect(goal().monthsToReach(200, 600)).toBe(3);
});

// normal case: the check card's numbers when the monthly amount falls short
test("works out the gap and coverage for the goal check", () => {
  const check = goal().check(100, { saved: 600, asOf: TODAY });
  expect(check).toMatchObject({
    saved: 600, monthlySaving: 100, monthlyNeeded: 200, onTrack: false,
    monthsLeft: 3, monthsToReach: 6, coveredBySavings: false, monthlyGap: 100, coverage: 0.5,
  });
});

// edge case (the M2 feedback): nothing left each month, but enough saved, is on track
test("is on track with no monthly surplus when savings cover the goal", () => {
  expect(goal().isOnTrack(0, TODAY, 1500)).toBe(true);
  expect(goal().monthlySavingsRequired(TODAY, 1500)).toBe(0);
  expect(goal().monthsToReach(0, 1500)).toBe(0);
  expect(goal().check(0, { saved: 1500, asOf: TODAY })).toMatchObject({
    onTrack: true, coveredBySavings: true, monthlyNeeded: 0, monthlyGap: 0, coverage: 1,
  });
});

// wrong case: nothing left each month and not enough saved is not on track
test("is not on track with no monthly surplus when savings fall short", () => {
  expect(goal().isOnTrack(0, TODAY, 600)).toBe(false);
  expect(goal().monthsToReach(0, 600)).toBe(Infinity);
});

// edge case: spending more than earning eats into savings that cover the goal today
test("counts a negative surplus against the savings", () => {
  // $1,300 minus $50 a month for 3 months leaves $1,150, short of $1,200
  expect(goal().isOnTrack(-50, TODAY, 1300)).toBe(false);
  expect(goal().check(-50, { saved: 1300, asOf: TODAY })).toMatchObject({ coveredBySavings: true, coverage: 0 });
  // $1,300 minus $30 a month for 3 months leaves $1,210, still enough
  expect(goal().isOnTrack(-30, TODAY, 1300)).toBe(true);
});

// edge case: with no savings the results are the same as before
test("gives the same results as before when nothing is saved", () => {
  expect(goal().monthlySavingsRequired(TODAY, 0)).toBe(goal().monthlySavingsRequired(TODAY));
  expect(goal().isOnTrack(400, TODAY, 0)).toBe(true);
  expect(goal().monthsToReach(400, 0)).toBe(goal().monthsToReach(400));
});

// wrong case: savings must be a number of 0 or more
test.each([
  ["negative", -1, RangeError],
  ["not a number", "500", TypeError],
  ["not finite", Infinity, TypeError],
])("rejects savings that are %s", (_, saved, error) => {
  expect(() => goal().isOnTrack(400, TODAY, saved)).toThrow(error);
  expect(() => goal().monthlySavingsRequired(TODAY, saved)).toThrow(error);
  expect(() => goal().monthsToReach(400, saved)).toThrow(error);
});
