// Unit tests for FinancialProfile's emergency fund: money kept for surprises that the goals never
// start from, so being able to afford a goal doesn't mean draining everything.
// Author: Aiyan Tong

const FinancialProfile = require("../src/financialProfile");

const VALID = { income: 5000, expenses: 4000, netWorth: 20000 };

function profile(changes = {}) {
  return new FinancialProfile({ ...VALID, ...changes });
}

// normal case: the goals start from the available funds minus the emergency fund
test("takes the emergency fund off the available funds", () => {
  expect(profile({ emergencyFund: 6000 }).moneyForGoals(15000)).toBe(9000);
});

// normal case: with no available funds entered, the goals start from the net worth
test("takes the emergency fund off the net worth when there are no available funds", () => {
  expect(profile({ emergencyFund: 6000 }).moneyForGoals()).toBe(14000);
  expect(profile({ emergencyFund: 6000 }).moneyForGoals(null)).toBe(14000);
});

// edge case: the emergency fund is optional and is 0 when left out, so nothing changes
test("treats a missing emergency fund as 0", () => {
  expect(profile().emergencyFund).toBe(0);
  expect(profile().moneyForGoals(15000)).toBe(15000);
  expect(FinancialProfile.validate(VALID)).toEqual({});
});

// edge case: an emergency fund bigger than the money leaves $0 for goals, never less
test("leaves $0 for goals when the emergency fund is bigger than the money", () => {
  expect(profile({ emergencyFund: 25000 }).moneyForGoals(15000)).toBe(0);
  expect(profile({ emergencyFund: 15000 }).moneyForGoals(15000)).toBe(0);
  expect(profile({ netWorth: -5000 }).moneyForGoals()).toBe(0);   // a negative net worth counts as 0
});

// edge case: available funds of $0 are used as they are, not swapped for the net worth
test("uses available funds of $0 instead of the net worth", () => {
  expect(profile().moneyForGoals(0)).toBe(0);
});

// wrong case: the emergency fund must be a number of $0 or more
test.each([
  [-1, "Emergency fund can't be negative."],
  [NaN, "Emergency fund must be a number."],
  ["6000", "Emergency fund must be a number."],
])("rejects an emergency fund of %p", (emergencyFund, message) => {
  expect(FinancialProfile.validate({ ...VALID, emergencyFund }).emergencyFund).toBe(message);
  expect(() => profile({ emergencyFund })).toThrow(message);
});

// wrong case: an invalid update throws and leaves the emergency fund as it was
test("updates the emergency fund only with a valid amount", () => {
  const p = profile({ emergencyFund: 6000 });
  p.updateEmergencyFund(9000);
  expect(p.emergencyFund).toBe(9000);
  expect(() => p.updateEmergencyFund(-1)).toThrow(RangeError);
  expect(p.emergencyFund).toBe(9000);
});

// wrong case: available funds that aren't a number are rejected
test("rejects available funds that aren't a number", () => {
  expect(() => profile().moneyForGoals("15000")).toThrow(TypeError);
});
