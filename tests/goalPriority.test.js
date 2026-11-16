// Unit tests for a FinancialGoal's priority and smallest acceptable amount (SPECIFICATIONS.md, items 2 and 12).
// Author: Aiyan Tong

const FinancialGoal = require("../src/financialGoal");

// A fixed "today", so the target date is always in the future.
const TODAY = new Date(2099, 0, 15);
const VALID = { name: "Car", targetAmount: 12000, targetDate: "2100-06-01", asOf: TODAY };
const errorsFor = (fields) => FinancialGoal.validate({ ...VALID, ...fields });
const PRIORITY_MESSAGE = "Choose a priority from 1 to 5.";
const MIN_MESSAGE = "The smallest amount you'd accept must be $0 or more and less than the goal amount.";

// ---------- Priority ----------

// normal case: a priority from the list is kept
test("keeps the priority it is given", () => {
  expect(new FinancialGoal({ ...VALID, priority: 4 }).priority).toBe(4);
});

// edge case: leaving the priority out gives 3, the middle
test("the priority is 3 when left out", () => {
  expect(errorsFor({})).toEqual({});
  expect(new FinancialGoal(VALID).priority).toBe(3);
});

// edge case: 1 and 5 are the lowest and highest allowed
test.each([1, 5])("allows priority %p", (priority) => {
  expect(errorsFor({ priority }).priority).toBeUndefined();
});

// wrong case: outside 1 to 5, not a whole number, or not a number at all
test.each([0, 6, -1, 2.5, NaN, "3", null])("rejects priority %p", (priority) => {
  expect(errorsFor({ priority }).priority).toBe(PRIORITY_MESSAGE);
});

// ---------- Smallest acceptable amount ----------

// normal case: an amount below the goal is kept
test("keeps a smallest acceptable amount below the goal amount", () => {
  expect(new FinancialGoal({ ...VALID, minAcceptableAmount: 8000 }).minAcceptableAmount).toBe(8000);
});

// edge case: 0 (the default) means only the full amount counts
test("the smallest acceptable amount is 0 when left out", () => {
  expect(new FinancialGoal(VALID).minAcceptableAmount).toBe(0);
  expect(errorsFor({ minAcceptableAmount: 0 }).minAcceptableAmount).toBeUndefined();
});

// edge case: one cent below the goal amount is the most allowed; the goal amount itself is not
test("must stay below the goal amount", () => {
  expect(errorsFor({ minAcceptableAmount: 11999.99 }).minAcceptableAmount).toBeUndefined();
  expect(errorsFor({ minAcceptableAmount: 12000 }).minAcceptableAmount).toBe(MIN_MESSAGE);
  expect(errorsFor({ minAcceptableAmount: 15000 }).minAcceptableAmount).toBe(MIN_MESSAGE);
});

// wrong case: negative or not a number
test.each([-1, NaN, Infinity, "8000", null])("rejects %p as the smallest acceptable amount", (minAcceptableAmount) => {
  expect(errorsFor({ minAcceptableAmount }).minAcceptableAmount).toBe(MIN_MESSAGE);
});

// edge case: when the goal amount itself is invalid, only that field gets a message
test("doesn't compare with a goal amount that is itself invalid", () => {
  const errors = errorsFor({ targetAmount: 0, minAcceptableAmount: 500 });
  expect(errors.targetAmount).toBe("Goal amount must be more than $0.");
  expect(errors.minAcceptableAmount).toBeUndefined();
});

// wrong case: the constructor throws and makes no goal
test("throws a RangeError for an invalid priority or smallest amount", () => {
  expect(() => new FinancialGoal({ ...VALID, priority: 9 })).toThrow(PRIORITY_MESSAGE);
  expect(() => new FinancialGoal({ ...VALID, minAcceptableAmount: 12000 })).toThrow(RangeError);
});

// normal case: the new fields are frozen like the rest of the goal
test("priority and smallest amount can't be changed after the goal is created", () => {
  const goal = new FinancialGoal({ ...VALID, priority: 2, minAcceptableAmount: 100 });
  goal.priority = 5;
  goal.minAcceptableAmount = 0;
  expect(goal.priority).toBe(2);
  expect(goal.minAcceptableAmount).toBe(100);
});
