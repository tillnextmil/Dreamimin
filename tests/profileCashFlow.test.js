// Unit tests for FinancialProfile: monthly cash flow and savings rate, decimal amounts,
// input checks, and updates.
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

// edge case: spending exactly what you earn leaves nothing over, and spending nothing saves it all
test("savings rate is 0% when spending equals income and 100% when spending is 0", () => {
  const even = new FinancialProfile({ income: 4000, expenses: 4000 });
  expect(even.monthlyCashFlow).toBe(0);
  expect(even.savingsRate).toBe(0);
  const saver = new FinancialProfile({ income: 2500, expenses: 0 });
  expect(saver.monthlyCashFlow).toBe(2500);
  expect(saver.savingsRate).toBe(1);
});

// edge case: amounts with cents work, even where floating-point math isn't exact
// (1000.10 - 500.20 is 499.90000000000003 in JavaScript), and whole dollars mix with cents
test("works with amounts that have cents", () => {
  const cents = new FinancialProfile({ income: 1000.1, expenses: 500.2 });
  expect(cents.monthlyCashFlow).toBeCloseTo(499.9, 2);
  const mixed = new FinancialProfile({ income: 5000, expenses: 1234.56 });
  expect(mixed.monthlyCashFlow).toBeCloseTo(3765.44, 2);
  expect(mixed.savingsRate).toBeCloseTo(0.753088, 6);
});

// edge case: net worth is 0 when left out, can be negative, and doesn't change cash flow
test("net worth is optional, can be negative, and doesn't change cash flow", () => {
  expect(new FinancialProfile({ income: 5000, expenses: 4000 }).netWorth).toBe(0);
  const inDebt = new FinancialProfile({ income: 5000, expenses: 4000, netWorth: -25000 });
  expect(inDebt.netWorth).toBe(-25000);
  expect(inDebt.monthlyCashFlow).toBe(1000);
});

// wrong case: negative income or spending is rejected
test("rejects negative income or spending", () => {
  expect(() => new FinancialProfile({ income: -1, expenses: 4000 })).toThrow("Monthly income can't be negative.");
  expect(() => new FinancialProfile({ income: 5000, expenses: -0.01 })).toThrow("Monthly spending can't be negative.");
});

// wrong case: money typed with "$" or commas is rejected here, because the page
// has to clean it into a plain number (4500) before it reaches the class
test.each(["$4,500", "4,500", "abc", ""])("rejects the text %p as income", (income) => {
  expect(() => new FinancialProfile({ income, expenses: 1000 })).toThrow("Monthly income must be a number.");
});

// wrong case: values that aren't real numbers are rejected
test.each([NaN, Infinity, null, undefined])("rejects %p as spending", (expenses) => {
  expect(() => new FinancialProfile({ income: 5000, expenses })).toThrow("Monthly spending must be a number.");
});

// normal case: results follow the new values after an update
test("cash flow and savings rate update when income and spending change", () => {
  const profile = new FinancialProfile({ income: 5000, expenses: 4000 });
  profile.updateIncome(6000);
  profile.updateExpenses(4500);
  expect(profile.monthlyCashFlow).toBe(1500);
  expect(profile.savingsRate).toBeCloseTo(0.25);
});

// wrong case: an invalid update throws and leaves the profile exactly as it was
test("an invalid update is rejected and leaves the profile unchanged", () => {
  const profile = new FinancialProfile({ income: 5000, expenses: 4000, netWorth: 10000 });
  expect(() => profile.updateIncome(-100)).toThrow(RangeError);
  expect(() => profile.updateExpenses("4,500")).toThrow(RangeError);
  expect(() => profile.updateNetWorth(NaN)).toThrow(RangeError);
  expect(profile.income).toBe(5000);
  expect(profile.expenses).toBe(4000);
  expect(profile.netWorth).toBe(10000);
});