// Unit tests for FundsEvent: recorded income or a loss, and rejecting invalid ones.
// Author: Autiana Wallace

const FundsEvent = require("../src/fundsEvent");

// Fixed date so results never depend on when the tests run.
const TODAY = new Date(2099, 0, 15);
const BONUS = { kind: "income", amount: 800, date: "2099-01-10", note: "Bonus", asOf: TODAY };

const errorsFor = (changes) => FundsEvent.validate({ ...BONUS, ...changes });

// normal case: valid income and a valid loss are kept, with how each changes the funds
test("records income and a loss", () => {
  const bonus = new FundsEvent({ ...BONUS, id: "b1" });
  expect(bonus).toMatchObject({ id: "b1", kind: "income", amount: 800, date: "2099-01-10", note: "Bonus" });
  expect(bonus.change).toBe(800);
  expect(new FundsEvent({ ...BONUS, kind: "loss", note: "Car repair" }).change).toBe(-800);
});

// edge case: the note is optional and trimmed, today is allowed, and an id is made up
test("trims the note, allows today, and makes up an id", () => {
  const event = new FundsEvent({ kind: "loss", amount: 50, date: "2099-01-15", note: "  Fine  ", asOf: TODAY });
  expect(event.note).toBe("Fine");
  expect(event.id).toMatch(/^event-/);
  expect(errorsFor({ note: "x".repeat(60) })).toEqual({});
});

// wrong case: a kind that isn't income or loss is rejected
test.each(["gift", "Income", "", undefined])("rejects the kind %p", (kind) => {
  expect(errorsFor({ kind }).kind).toBe("Choose income or loss.");
});

// wrong case: amount, date and note follow the same rules and messages as an Expense
test("rejects an invalid amount, date or note with Expense's messages", () => {
  expect(errorsFor({ amount: 0 }).amount).toBe("Spending amount must be more than $0.");
  expect(errorsFor({ amount: "800" }).amount).toBe("Spending amount must be a number.");
  expect(errorsFor({ date: "2099-02-30" }).date).toBe("Choose a valid date.");
  expect(errorsFor({ date: "2099-01-16" }).date).toBe("The date can't be in the future.");
  expect(errorsFor({ note: "x".repeat(61) }).note).toBe("Keep the note to 60 characters or fewer.");
});

// wrong case: the constructor throws instead of creating an invalid event, and an event can't be changed
test("throws for invalid input and can't be changed after it is created", () => {
  expect(() => new FundsEvent({ ...BONUS, kind: "gift" })).toThrow(RangeError);
  const event = new FundsEvent(BONUS);
  event.amount = 1;
  expect(Object.isFrozen(event)).toBe(true);
  expect(event.amount).toBe(800);
});