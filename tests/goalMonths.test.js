// Unit tests for FinancialGoal: months remaining and monthly saving required.
// Author: Aiyan Tong

const FinancialGoal = require("../src/financialGoal");

// Fixed date so results never depend on when the tests run.
// The 15th is treated as the monthly saving day.
const TODAY = new Date(2099, 0, 15);
const TARGET_AMOUNT = 1200;

function goalDueOn(targetDate) {
  return new FinancialGoal({ targetAmount: TARGET_AMOUNT, targetDate });
}

// normal case: the deadline lands exactly on the saving day, so every month counts
test("splits the target evenly over the months remaining", () => {
  const goal = goalDueOn("2099-04-15");
  expect(goal.monthsRemaining(TODAY)).toBe(3);
  expect(goal.monthlySavingsRequired(TODAY)).toBe(TARGET_AMOUNT / 3);
});

// edge case: one day short of the saving day means the last deposit can't be made
test("counts one month fewer when the deadline is one day before the saving day", () => {
  const goal = goalDueOn("2099-04-14");
  expect(goal.monthsRemaining(TODAY)).toBe(2);
  expect(goal.monthlySavingsRequired(TODAY)).toBe(TARGET_AMOUNT / 2);
});

// edge case: a deadline under a month away must give 1 month, never 0 (no divide by zero)
test("counts months correctly across a year boundary", () => {
  const novemberToday = new Date(2099, 10, 15);
  const goal = goalDueOn("2100-02-15");
  expect(goal.monthsRemaining(novemberToday)).toBe(3);
  expect(goal.monthlySavingsRequired(novemberToday)).toBe(TARGET_AMOUNT / 3);
});

// edge case: a deadline under a month away must give 1 month, never 0 (no divide by zero)
test("never reports fewer than 1 month remaining", () => {
  const dueTomorrow = goalDueOn("2099-01-16");
  const dueOneDayShortOfAMonth = goalDueOn("2099-02-14");

  expect(dueTomorrow.monthsRemaining(TODAY)).toBe(1);
  expect(dueTomorrow.monthlySavingsRequired(TODAY)).toBe(TARGET_AMOUNT);
  expect(dueOneDayShortOfAMonth.monthsRemaining(TODAY)).toBe(1);
  expect(dueOneDayShortOfAMonth.monthlySavingsRequired(TODAY)).toBe(TARGET_AMOUNT);
});
