// Unit tests for Expense: creating a recorded spending and rejecting invalid ones.
// Author: Autiana Wallace

const Expense = require("../src/expense");

// Fixed date so results never depend on when the tests run.
const TODAY = new Date(2099, 0, 15);
const VALID = { amount: 42.5, date: "2099-01-10", note: "Groceries", asOf: TODAY };

function errorsFor(changes) {
  return Expense.validate({ ...VALID, ...changes });
}

// normal case: valid input gives no errors and stores the values
test("records a valid spending", () => {
  expect(errorsFor({})).toEqual({});
  const expense = new Expense({ ...VALID, id: "e1" });
  expect(expense.id).toBe("e1");
  expect(expense.amount).toBe(42.5);
  expect(expense.date).toBe("2099-01-10");
  expect(expense.note).toBe("Groceries");
});

// edge case: the note is optional and trimmed, and an id is made up when left out
test("trims the note, allows no note, and makes up an id", () => {
  expect(new Expense({ ...VALID, note: "  Gas  " }).note).toBe("Gas");
  const noNote = new Expense({ amount: 10, date: "2099-01-10", asOf: TODAY });
  expect(noNote.note).toBe("");
  expect(noNote.id).toMatch(/^expense-/);
});

// edge case: exactly 60 characters is allowed, 61 is not
test("allows a note of up to 60 characters", () => {
  expect(errorsFor({ note: "x".repeat(60) })).toEqual({});
  expect(errorsFor({ note: "x".repeat(61) }).note).toBe("Keep the note to 60 characters or fewer.");
});

// edge case: today is a valid date, tomorrow is not
test("allows today but not a future date", () => {
  expect(errorsFor({ date: "2099-01-15" })).toEqual({});
  expect(errorsFor({ date: "2099-01-16" }).date).toBe("The date can't be in the future.");
});

// wrong case: amounts of $0 or less are rejected
test.each([0, -5])("rejects the amount %p", (amount) => {
  expect(errorsFor({ amount }).amount).toBe("Spending amount must be more than $0.");
});

// wrong case: amounts that aren't numbers, including text with "$" or commas, are rejected
test.each(["$42.50", "1,200", NaN, Infinity, null, undefined])("rejects the non-number amount %p", (amount) => {
  expect(errorsFor({ amount }).amount).toBe("Spending amount must be a number.");
});

// wrong case: dates that aren't real calendar dates are rejected
test.each(["2099-02-30", "2099-13-01", "01/10/2099", "", null])("rejects the date %p", (date) => {
  expect(errorsFor({ date }).date).toBe("Choose a valid date.");
});

// wrong case: the constructor throws a RangeError instead of creating an invalid spending
test("throws a RangeError for invalid input", () => {
  expect(() => new Expense({ ...VALID, amount: 0 })).toThrow(RangeError);
  expect(() => new Expense({ ...VALID, date: "2099-01-16" })).toThrow("The date can't be in the future.");
});

// edge case: a recorded spending can't be changed after it is created
test("can't be changed after it is created", () => {
  const expense = new Expense(VALID);
  expense.amount = 1;   // ignored, because the spending is frozen
  expect(Object.isFrozen(expense)).toBe(true);
  expect(expense.amount).toBe(42.5);
});