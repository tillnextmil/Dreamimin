// Unit tests for AvailableFunds: the balance, updating it, and recording and removing spending.
// Author: Autiana Wallace

const AvailableFunds = require("../src/availableFunds");

// Stands in for an Expense (src/expense.js): AvailableFunds only uses its id, amount and date.
function spending(id, amount, date = "2026-10-15") {
  return Object.freeze({ id, amount, date, note: "" });
}

// ---------- Creating funds ----------

// normal case: funds start with the balance given and no spending
test("starts with the balance given and no spending", () => {
  const funds = new AvailableFunds({ id: "funds-a", balance: 5000 });
  expect(funds.id).toBe("funds-a");
  expect(funds.balance).toBe(5000);
  expect(funds.expenses).toEqual([]);
  expect(funds.totalSpent).toBe(0);
});

// edge case: $0 and amounts with cents are allowed, and an id is made up when left out
test("allows $0 and cents, and makes up an id", () => {
  expect(new AvailableFunds({ balance: 0 }).balance).toBe(0);
  expect(new AvailableFunds({ balance: 1234.56 }).balance).toBe(1234.56);
  expect(new AvailableFunds({ balance: 100 }).id).toMatch(/^funds-/);
});

// wrong case: negative funds are rejected
test("rejects negative funds", () => {
  expect(() => new AvailableFunds({ balance: -0.01 })).toThrow(RangeError);
  expect(() => new AvailableFunds({ balance: -500 })).toThrow("Available funds can't be negative.");
});

// wrong case: funds that aren't a number, including text typed with "$" or commas, are rejected
test.each(["$5,000", "5000", NaN, Infinity, null, undefined])("rejects %p as funds", (balance) => {
  expect(AvailableFunds.validate({ balance })).toEqual({ balance: "Available funds must be a number." });
  expect(() => new AvailableFunds({ balance })).toThrow(RangeError);
});

// ---------- Updating the balance ----------

// normal case: the balance can be set to a new amount, and recorded spending stays recorded
test("updates the balance and keeps recorded spending", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("e1", 200));
  funds.updateBalance(3000);
  expect(funds.balance).toBe(3000);
  expect(funds.totalSpent).toBe(200);
});

// wrong case: an invalid update throws and leaves the funds as they were
test("an invalid update leaves the balance unchanged", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  expect(() => funds.updateBalance(-1)).toThrow("Available funds can't be negative.");
  expect(() => funds.updateBalance("2,000")).toThrow("Available funds must be a number.");
  expect(funds.balance).toBe(1000);
});

// ---------- Recording spending ----------

// normal case: recording spending lowers the balance, returns it, and keeps the spending
test("recording spending lowers the balance", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  expect(funds.recordSpending(spending("e1", 250))).toBe(750);
  expect(funds.recordSpending(spending("e2", 100.5))).toBe(649.5);
  expect(funds.balance).toBe(649.5);
  expect(funds.totalSpent).toBe(350.5);
  expect(funds.expenses.map((e) => e.id)).toEqual(["e1", "e2"]);
});

// edge case: exactly the balance can be spent, leaving $0
test("spending exactly the balance leaves $0", () => {
  const funds = new AvailableFunds({ balance: 300 });
  expect(funds.recordSpending(spending("e1", 300))).toBe(0);
});

// wrong case: spending more than the balance, even by one cent, is rejected and changes nothing
test("rejects spending more than the balance", () => {
  const funds = new AvailableFunds({ balance: 300 });
  expect(() => funds.recordSpending(spending("e1", 300.01))).toThrow("That's more than your available funds.");
  expect(funds.balance).toBe(300);
  expect(funds.expenses).toEqual([]);
});

// edge case: cents add up exactly (0.3 - 0.1 is 0.19999999999999998 in plain JavaScript)
test("cents don't pick up floating-point error", () => {
  const funds = new AvailableFunds({ balance: 0.3 });
  expect(funds.recordSpending(spending("e1", 0.1))).toBe(0.2);
  expect(funds.recordSpending(spending("e2", 0.2))).toBe(0);
  expect(funds.totalSpent).toBe(0.3);
});

// wrong case: something that isn't an Expense can't be recorded
test.each([50, "50", null, undefined, { amount: 50 }, { id: "e1", amount: 0 }, { id: "e1", amount: "50" }])(
  "rejects %p as spending",
  (notAnExpense) => {
    const funds = new AvailableFunds({ balance: 1000 });
    expect(() => funds.recordSpending(notAnExpense)).toThrow(TypeError);
    expect(() => funds.recordSpending(notAnExpense)).toThrow("Record an Expense.");
    expect(funds.balance).toBe(1000);
  }
);

// normal case: recorded spending is listed oldest first, whatever order it was recorded in
test("lists recorded spending oldest first", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("late", 10, "2026-10-20"));
  funds.recordSpending(spending("early", 10, "2026-10-01"));
  expect(funds.expenses.map((e) => e.id)).toEqual(["early", "late"]);
});

// edge case: the list is a copy that can't be changed, so the funds stay as recorded
test("the list of spending can't be changed from outside", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("e1", 100));
  expect(() => funds.expenses.push(spending("e2", 100))).toThrow(TypeError);
  expect(funds.expenses.length).toBe(1);
  expect(funds.balance).toBe(900);
});

// ---------- Removing spending ----------

// normal case: removing spending adds its amount back and returns the new balance
test("removing spending adds the amount back", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("e1", 250));
  funds.recordSpending(spending("e2", 100));
  expect(funds.removeSpending("e1")).toBe(900);
  expect(funds.expenses.map((e) => e.id)).toEqual(["e2"]);
  expect(funds.totalSpent).toBe(100);
});

// wrong case: removing spending that isn't recorded is rejected and changes nothing
test("rejects removing spending with an unknown id", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("e1", 250));
  expect(() => funds.removeSpending("nope")).toThrow("No spending with that id.");
  expect(() => funds.removeSpending("nope")).toThrow(RangeError);
  expect(funds.balance).toBe(750);
  expect(funds.expenses.length).toBe(1);
});

// edge case: the same spending can't be removed twice
test("spending can only be removed once", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("e1", 250));
  funds.removeSpending("e1");
  expect(() => funds.removeSpending("e1")).toThrow("No spending with that id.");
  expect(funds.balance).toBe(1000);
});