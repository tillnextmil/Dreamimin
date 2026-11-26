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

// ---------- Setting the funds from what the user entered ----------

// normal case: the balance is the entered amount minus the spending already recorded
test("the balance is the entered amount minus recorded spending", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("e1", 300));
  expect(funds.setEnteredAmount(2000)).toBe(1700);
  expect(funds.balance).toBe(1700);
  expect(funds.totalSpent).toBe(300);
});

// normal case: with no spending recorded, the balance is the entered amount
test("with no spending, the balance is the entered amount", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  expect(funds.setEnteredAmount(500)).toBe(500);
});

// edge case: entering exactly what has been spent leaves $0
test("entering exactly what has been spent leaves $0", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("e1", 300));
  expect(funds.setEnteredAmount(300)).toBe(0);
});

// edge case: cents add up exactly (0.3 - 0.1 is 0.19999999999999998 in plain JavaScript)
test("entered amounts with cents don't pick up floating-point error", () => {
  const funds = new AvailableFunds({ balance: 1 });
  funds.recordSpending(spending("e1", 0.1));
  expect(funds.setEnteredAmount(0.3)).toBe(0.2);
});

// wrong case: entering less than has been spent is rejected and changes nothing
test("rejects an amount less than the spending recorded", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("e1", 300));
  expect(() => funds.setEnteredAmount(299.99)).toThrow(RangeError);
  expect(() => funds.setEnteredAmount(299.99)).toThrow("That's less than the spending you've recorded.");
  expect(funds.balance).toBe(700);
});

// wrong case: an amount that isn't a number, or is negative, is rejected and changes nothing
test.each([
  ["2,000", "Available funds must be a number."],
  [NaN, "Available funds must be a number."],
  [null, "Available funds must be a number."],
  [-5, "Available funds can't be negative."],
])("rejects %p as the entered amount", (entered, message) => {
  const funds = new AvailableFunds({ balance: 1000 });
  expect(() => funds.setEnteredAmount(entered)).toThrow(message);
  expect(funds.balance).toBe(1000);
});

// ---------- Editing spending ----------

// normal case: editing spending changes the balance by the difference and keeps the edit
test("editing spending changes the balance by the difference", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordSpending(spending("e1", 200));
  expect(funds.editSpending("e1", spending("e1", 350))).toBe(650);
  expect(funds.editSpending("e1", spending("e1", 50))).toBe(950);
  expect(funds.totalSpent).toBe(50);
  expect(funds.expenses.map((e) => e.amount)).toEqual([50]);
});

// edge case: an edit can use up exactly all the funds
test("an edit can leave exactly $0", () => {
  const funds = new AvailableFunds({ balance: 500 });
  funds.recordSpending(spending("e1", 100));
  expect(funds.editSpending("e1", spending("e1", 500))).toBe(0);
});

// wrong case: an edit that would leave the funds below $0 is rejected and changes nothing
test("rejects an edit that spends more than the funds", () => {
  const funds = new AvailableFunds({ balance: 500 });
  funds.recordSpending(spending("e1", 100));
  expect(() => funds.editSpending("e1", spending("e1", 500.01))).toThrow("That's more than your available funds.");
  expect(funds.balance).toBe(400);
  expect(funds.expenses[0].amount).toBe(100);
});

// wrong case: unknown ids, a changed id and things that aren't an Expense are rejected
test("rejects an unknown id, a changed id or something that isn't an Expense", () => {
  const funds = new AvailableFunds({ balance: 500 });
  funds.recordSpending(spending("e1", 100));
  expect(() => funds.editSpending("nope", spending("nope", 50))).toThrow("No spending with that id.");
  expect(() => funds.editSpending("e1", spending("e2", 50))).toThrow("The edited spending must keep its id.");
  expect(() => funds.editSpending("e1", { id: "e1", amount: 0 })).toThrow(TypeError);
  expect(funds.balance).toBe(400);
});

// ---------- Income and losses ----------

// Stands in for a FundsEvent (src/fundsEvent.js): an id, a kind, an amount and a date.
function event(id, kind, amount, date = "2026-10-15") {
  return Object.freeze({ id, kind, amount, date, note: "" });
}

// normal case: income raises the balance, a loss lowers it, and the totals add them up
test("income raises the balance and a loss lowers it", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  expect(funds.recordEvent(event("i1", "income", 800))).toBe(1800);
  expect(funds.recordEvent(event("l1", "loss", 300))).toBe(1500);
  expect(funds.totalIncome).toBe(800);
  expect(funds.totalLoss).toBe(300);
  expect(funds.events.map((e) => e.id)).toEqual(["i1", "l1"]);
});

// normal case: the entered amount counts income and losses as well as spending
test("setEnteredAmount works out entered + income - losses - spending", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordEvent(event("i1", "income", 800));
  funds.recordEvent(event("l1", "loss", 300));
  funds.recordSpending(spending("e1", 200));
  expect(funds.setEnteredAmount(2000)).toBe(2300);
  expect(() => funds.setEnteredAmount(0)).not.toThrow();   // 0 + 800 - 300 - 200 = 300
  expect(() => funds.setEnteredAmount(-1)).toThrow("Available funds can't be negative.");
});

// wrong case: a loss more than the funds is rejected and changes nothing
test("rejects a loss more than the funds", () => {
  const funds = new AvailableFunds({ balance: 100 });
  expect(() => funds.recordEvent(event("l1", "loss", 100.01))).toThrow("That's more than your available funds.");
  expect(funds.balance).toBe(100);
  expect(funds.events).toEqual([]);
});

// normal case: removing an event undoes its change
test("removing income or a loss undoes its change", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordEvent(event("i1", "income", 500));
  funds.recordEvent(event("l1", "loss", 200));
  expect(funds.removeEvent("l1")).toBe(1500);
  expect(funds.removeEvent("i1")).toBe(1000);
});

// wrong case: removing income that has already been spent is rejected and changes nothing
test("rejects removing income that has been spent", () => {
  const funds = new AvailableFunds({ balance: 0 });
  funds.recordEvent(event("i1", "income", 500));
  funds.recordSpending(spending("e1", 400));
  expect(() => funds.removeEvent("i1")).toThrow("That would leave your available funds below $0.");
  expect(funds.balance).toBe(100);
  expect(() => funds.removeEvent("nope")).toThrow("No income or loss with that id.");
});

// normal case: editing an event changes the balance by the difference, even when the kind changes
test("editing income or a loss changes the balance by the difference", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  funds.recordEvent(event("i1", "income", 500));
  expect(funds.editEvent("i1", event("i1", "income", 700))).toBe(1700);
  expect(funds.editEvent("i1", event("i1", "loss", 100))).toBe(900);
  expect(funds.totalIncome).toBe(0);
  expect(funds.totalLoss).toBe(100);
});

// wrong case: an edit that would leave the funds below $0 says why, and changes nothing
test("rejects an edit that would leave the funds below $0", () => {
  const funds = new AvailableFunds({ balance: 0 });
  funds.recordEvent(event("i1", "income", 500));
  funds.recordSpending(spending("e1", 400));
  expect(() => funds.editEvent("i1", event("i1", "income", 300))).toThrow("That would leave your available funds below $0.");
  expect(() => funds.editEvent("i1", event("i1", "loss", 1))).toThrow("That's more than your available funds.");
  expect(() => funds.editEvent("i1", event("i2", "income", 600))).toThrow("The edited income or loss must keep its id.");
  expect(funds.balance).toBe(100);
});

// wrong case: something that isn't income or a loss can't be recorded
test.each([{ id: "x", kind: "gift", amount: 10 }, { id: "x", kind: "income", amount: 0 }, { kind: "loss", amount: 5 }, null])(
  "rejects %p as income or a loss",
  (notAnEvent) => {
    const funds = new AvailableFunds({ balance: 100 });
    expect(() => funds.recordEvent(notAnEvent)).toThrow("Record income or a loss.");
    expect(funds.balance).toBe(100);
  }
);

// ---------- Finding spending (the page's filters) ----------

describe("findSpending", () => {
  let funds;
  beforeEach(() => {
    funds = new AvailableFunds({ balance: 5000 });
    funds.recordSpending({ id: "rent", amount: 1200, date: "2026-11-01", note: "Rent", category: "housing" });
    funds.recordSpending({ id: "food1", amount: 60, date: "2026-11-10", note: "Groceries", category: "food" });
    funds.recordSpending({ id: "food2", amount: 86, date: "2026-11-24", note: "Dinner with Sam", category: "food" });
    funds.recordSpending({ id: "misc", amount: 20, date: "2026-11-15" });   // no note or category
  });
  const ids = (filters) => funds.findSpending(filters).map((e) => e.id);

  // normal case: no filters keeps everything, oldest first
  test("keeps everything without filters", () => {
    expect(ids()).toEqual(["rent", "food1", "misc", "food2"]);
    expect(ids({ category: "", from: "", to: "", search: "" })).toEqual(["rent", "food1", "misc", "food2"]);
  });

  // normal case: each filter on its own, and together
  test("filters by category, date range and note", () => {
    expect(ids({ category: "food" })).toEqual(["food1", "food2"]);
    expect(ids({ from: "2026-11-10", to: "2026-11-15" })).toEqual(["food1", "misc"]);
    expect(ids({ search: "  DINNER " })).toEqual(["food2"]);
    expect(ids({ category: "food", from: "2026-11-20" })).toEqual(["food2"]);
  });

  // edge case: spending without a category counts as "other"; the dates are both included
  test("counts no category as other, and includes both end dates", () => {
    expect(ids({ category: "other" })).toEqual(["misc"]);
    expect(ids({ from: "2026-11-24", to: "2026-11-24" })).toEqual(["food2"]);
    expect(ids({ search: "house" })).toEqual([]);
  });

  // wrong case: a date that isn't real, or an end before the start, is rejected
  test("rejects a date that isn't real or an end before the start", () => {
    expect(() => funds.findSpending({ from: "2026-02-30" })).toThrow("Choose a valid date.");
    expect(() => funds.findSpending({ to: "11/24/2026" })).toThrow(RangeError);
    expect(() => funds.findSpending({ from: "2026-11-20", to: "2026-11-10" })).toThrow("The end date can't be before the start date.");
  });
});

// ---------- Latest income (for the extra money choice) ----------

// normal case: the most recently dated income, ignoring losses; null without income
test("latestIncome is the most recently dated income", () => {
  const funds = new AvailableFunds({ balance: 1000 });
  expect(funds.latestIncome).toBeNull();
  funds.recordEvent({ id: "late", kind: "income", amount: 300, date: "2026-11-20", note: "" });
  funds.recordEvent({ id: "early", kind: "income", amount: 800, date: "2026-11-01", note: "" });
  funds.recordEvent({ id: "loss", kind: "loss", amount: 50, date: "2026-11-25", note: "" });
  expect(funds.latestIncome.id).toBe("late");
  funds.recordEvent({ id: "same day", kind: "income", amount: 40, date: "2026-11-20", note: "" });
  expect(funds.latestIncome.id).toBe("same day");   // the last one recorded on the latest date
});