// Unit tests for FinancialGoal: input validation, and goals staying valid after creation.
// Author: Aiyan Tong

const FinancialGoal = require("../src/financialGoal");

// Fixed date so results never depend on when the tests run.
const TODAY = new Date(2099, 0, 15);
const VALID = { name: "House", targetAmount: 1200, targetDate: "2099-04-15", asOf: TODAY };

function errorsFor(changes) {
  return FinancialGoal.validate({ ...VALID, ...changes });
}

// normal case: valid input gives no errors and builds a goal
test("accepts a valid goal", () => {
  expect(errorsFor({})).toEqual({});
  const goal = new FinancialGoal(VALID);
  expect(goal.name).toBe("House");
  expect(goal.targetAmount).toBe(1200);
  expect(goal.targetDate).toBe("2099-04-15");
});

// edge case: the name is trimmed, and exactly 60 characters is allowed
test("trims the name and allows up to 60 characters", () => {
  expect(new FinancialGoal({ ...VALID, name: "  House  " }).name).toBe("House");
  expect(errorsFor({ name: "x".repeat(60) })).toEqual({});
  expect(errorsFor({ name: "x".repeat(61) }).name).toBe("Keep the name to 60 characters or fewer.");
});

// wrong case: a blank or missing name is rejected
test.each(["", "   ", null, 42])("rejects the name %p", (name) => {
  expect(errorsFor({ name }).name).toBe("Give your goal a name.");
});

// wrong case: an amount of $0 or less is rejected
test.each([0, -1])("rejects the amount %p", (targetAmount) => {
  expect(errorsFor({ targetAmount }).targetAmount).toBe("Goal amount must be more than $0.");
});

// wrong case: an amount that isn't a number is rejected
test.each([NaN, Infinity, "1200", null])("rejects the non-number amount %p", (targetAmount) => {
  expect(errorsFor({ targetAmount }).targetAmount).toBe("Goal amount must be a number.");
});

// wrong case: dates that aren't real calendar dates are rejected
test.each(["2099-02-30", "2099-13-01", "04/15/2099", "", null])("rejects the date %p", (targetDate) => {
  expect(errorsFor({ targetDate }).targetDate).toBe("Choose a valid target date.");
});

// edge case: the target date must be after today, so today itself is rejected and tomorrow is fine
test("rejects today and earlier, accepts tomorrow", () => {
  expect(errorsFor({ targetDate: "2099-01-15" }).targetDate).toBe("Target date must be after today.");
  expect(errorsFor({ targetDate: "2098-12-31" }).targetDate).toBe("Target date must be after today.");
  expect(errorsFor({ targetDate: "2099-01-16" })).toEqual({});
});

// wrong case: the constructor throws instead of building an invalid goal
test("throws a RangeError for invalid input", () => {
  expect(() => new FinancialGoal({ ...VALID, targetAmount: 0 })).toThrow(RangeError);
  expect(() => new FinancialGoal({ ...VALID, targetDate: "2099-01-15" })).toThrow("Target date must be after today.");
});

// wrong case: a monthly saving that isn't a number is rejected
test.each([NaN, "400", undefined])("rejects the monthly saving %p", (saving) => {
  const goal = new FinancialGoal(VALID);
  expect(() => goal.isOnTrack(saving, TODAY)).toThrow(TypeError);
  expect(() => goal.monthsToReach(saving)).toThrow(TypeError);
});

// edge case: a goal can't be changed into an invalid one after it is created
test("can't be changed after it is created", () => {
  const goal = new FinancialGoal(VALID);
  goal.targetAmount = -5;   // ignored outside strict mode, throws inside it
  expect(Object.isFrozen(goal)).toBe(true);
  expect(goal.targetAmount).toBe(1200);
});

// edge case: floating-point noise doesn't add a month, so on track and months to reach agree
test("saving exactly the required amount reaches the goal in time", () => {
  const goal = new FinancialGoal({ ...VALID, targetAmount: 17, targetDate: "2099-08-15" });
  const required = goal.monthlySavingsRequired(TODAY);   // 17 / 7, not exact in floating point
  expect(goal.isOnTrack(required, TODAY)).toBe(true);
  expect(goal.monthsToReach(required)).toBe(7);
});
