// Unit tests for FinancialProfile: monthly cash flow and savings rate.
// Author: Autiana Wallace

const FinancialProfile = require("../src/financialProfile");

// normal case: earning more than spending leaves money over each month
test("cash flow and savings rate for a normal budget", () => {
  const profile = new FinancialProfile({ income: 5000, expenses: 4000 });
  expect(profile.monthlyCashFlow).toBe(1000);
  expect(profile.savingsRate).toBeCloseTo(0.2);
});

// wrong case: spending more than income gives a negative cash flow and rate
test("cash flow and savings rate are negative when spending more than income", () => {
  const profile = new FinancialProfile({ income: 3000, expenses: 3600 });
  expect(profile.monthlyCashFlow).toBe(-600);
  expect(profile.savingsRate).toBeCloseTo(-0.2);
});

// edge case: no income gives a savings rate of 0 instead of dividing by zero
test("savings rate is 0 when income is 0", () => {
  const profile = new FinancialProfile({ income: 0, expenses: 500 });
  expect(profile.monthlyCashFlow).toBe(-500);
  expect(profile.savingsRate).toBe(0);
});

// edge case: spending exactly what you earn leaves nothing over
test("cash flow and savings rate are 0 when spending equals income", () => {
  const profile = new FinancialProfile({ income: 4000, expenses: 4000 });
  expect(profile.monthlyCashFlow).toBe(0);
  expect(profile.savingsRate).toBe(0);
});

// normal case: results follow the new values after an update
test("cash flow and savings rate update when income and spending change", () => {
  const profile = new FinancialProfile({ income: 5000, expenses: 4000 });
  profile.updateIncome(6000);
  profile.updateExpenses(4500);
  expect(profile.monthlyCashFlow).toBe(1500);
  expect(profile.savingsRate).toBeCloseTo(0.25);
});