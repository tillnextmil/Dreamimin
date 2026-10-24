// Author: Jessica Chang

const FinancialGoal = require("../src/financialGoal");

// fixed "today" so the month math doesn't change depending on when the tests run
const asOf = new Date(2029, 5, 15); // June 15, 2029

// normal case: $1,200 over 12 months needs $100 a month
test("monthlySavingsRequired splits the target over the months left", () => {
  const goal = new FinancialGoal({ name: "Laptop", targetAmount: 1200, targetDate: "2030-06-15" });
  expect(goal.monthsRemaining(asOf)).toBe(12);
  expect(goal.monthlySavingsRequired(asOf)).toBe(100);
  expect(goal.isOnTrack(100, asOf)).toBe(true);
  expect(goal.isOnTrack(99, asOf)).toBe(false);
});

// wrong case: bad inputs are rejected with a message for each field
test("validate reports a bad name, amount and date", () => {
  const errors = FinancialGoal.validate({ name: "  ", targetAmount: -5, targetDate: "2029-01-01", asOf });
  expect(errors.name).toBe("Give your goal a name.");
  expect(errors.targetAmount).toBe("Goal amount must be more than $0.");
  expect(errors.targetDate).toBe("Target date must be after today.");
});

// edge case: impossible calendar dates and saving nothing
test("parseDate rejects Feb 30 and monthsToReach is Infinity at $0", () => {
  expect(FinancialGoal.parseDate("2030-02-30")).toBeNull();
  const goal = new FinancialGoal({ targetAmount: 500, targetDate: "2030-06-15" });
  expect(goal.monthsToReach(0)).toBe(Infinity);
  expect(goal.monthsToReach(100)).toBe(5);
});
