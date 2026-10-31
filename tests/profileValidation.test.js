// Unit tests for FinancialProfile: input validation, and bad updates leaving the profile unchanged.
// Author: Aiyan Tong

const FinancialProfile = require("../src/financialProfile");

const VALID = { income: 5000, expenses: 4000, netWorth: 20000 };

function errorsFor(changes) {
  return FinancialProfile.validate({ ...VALID, ...changes });
}

// normal case: valid input gives no errors and builds a profile
test("accepts a valid profile", () => {
  expect(errorsFor({})).toEqual({});
  const profile = new FinancialProfile(VALID);
  expect(profile.income).toBe(5000);
  expect(profile.expenses).toBe(4000);
  expect(profile.netWorth).toBe(20000);
});

// edge case: net worth is optional and is 0 when left out
test("treats a missing net worth as 0", () => {
  expect(new FinancialProfile({ income: 5000, expenses: 4000 }).netWorth).toBe(0);
});

// edge case: net worth can be negative, since a person can owe more than they own
test("accepts a negative net worth", () => {
  expect(errorsFor({ netWorth: -15000 })).toEqual({});
  expect(new FinancialProfile({ ...VALID, netWorth: -15000 }).netWorth).toBe(-15000);
});

// edge case: 0 is a valid income and a valid spending amount, and decimals are allowed
test("accepts 0 and decimals for income and spending", () => {
  expect(errorsFor({ income: 0, expenses: 0 })).toEqual({});
  expect(errorsFor({ income: 4500.5, expenses: 3200.25 })).toEqual({});
});

// wrong case: income and spending can't be negative
test("rejects a negative income or spending", () => {
  expect(errorsFor({ income: -1 }).income).toBe("Monthly income can't be negative.");
  expect(errorsFor({ expenses: -0.01 }).expenses).toBe("Monthly spending can't be negative.");
});

// wrong case: each field must be a real number
test.each([NaN, Infinity, "5000", null, undefined])("rejects the non-number %p in every field", (value) => {
  expect(errorsFor({ income: value }).income).toBe("Monthly income must be a number.");
  expect(errorsFor({ expenses: value }).expenses).toBe("Monthly spending must be a number.");
  if (value !== undefined) {   // a missing net worth is allowed and becomes 0 in the constructor
    expect(errorsFor({ netWorth: value }).netWorth).toBe("Net worth must be a number.");
  }
});

// wrong case: every invalid field gets its own message
test("reports each invalid field", () => {
  expect(FinancialProfile.validate({ income: -1, expenses: "x", netWorth: NaN })).toEqual({
    income: "Monthly income can't be negative.",
    expenses: "Monthly spending must be a number.",
    netWorth: "Net worth must be a number.",
  });
});

// wrong case: the constructor throws instead of building an invalid profile
test("throws a RangeError for invalid input", () => {
  expect(() => new FinancialProfile({ ...VALID, income: -1 })).toThrow(RangeError);
  expect(() => new FinancialProfile({ ...VALID, expenses: NaN })).toThrow("Monthly spending must be a number.");
});

// normal case: valid updates change only that field
test("updates income, spending and net worth", () => {
  const profile = new FinancialProfile(VALID);
  profile.updateIncome(6000);
  profile.updateExpenses(4500);
  profile.updateNetWorth(-500);
  expect(profile).toMatchObject({ income: 6000, expenses: 4500, netWorth: -500 });
  expect(profile.monthlyCashFlow).toBe(1500);
});

// wrong case: an invalid update throws and leaves the profile as it was
test.each([
  ["updateIncome", -100],
  ["updateIncome", "6000"],
  ["updateExpenses", -1],
  ["updateExpenses", NaN],
  ["updateNetWorth", Infinity],
])("%s(%p) throws and changes nothing", (method, value) => {
  const profile = new FinancialProfile(VALID);
  expect(() => profile[method](value)).toThrow(RangeError);
  expect(profile).toMatchObject(VALID);
});
