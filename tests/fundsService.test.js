// Unit tests for the funds and spending SQL (server/repositories/fundsRepository.js and
// expenseRepository.js) and rules (server/services/fundsService.js): entering funds, recording,
// editing and removing spending, the funds never going below $0, and the spending filters.
// Author: Autiana Wallace

const { openDatabase, PROFILE_ID } = require("../server/db");
const FundsRepository = require("../server/repositories/fundsRepository");
const ExpenseRepository = require("../server/repositories/expenseRepository");
const FundsEventRepository = require("../server/repositories/fundsEventRepository");
const FundsService = require("../server/services/fundsService");
const ServiceError = require("../server/services/serviceError");

// Fixed "today" so results never depend on when the tests run.
const TODAY = new Date(2026, 10, 25);
const DINNER = { amount: 86, date: "2026-11-24", note: "Dinner", category: "food" };

let db, service;
beforeEach(() => {
  db = openDatabase(":memory:");
  service = new FundsService(new FundsRepository(db), new ExpenseRepository(db), new FundsEventRepository(db), { profileId: PROFILE_ID, now: () => TODAY });
});

afterEach(() => {
  db.close();
});

// the ServiceError a call throws, so tests can check its status and body
function errorFrom(call) {
  try {
    call();
  } catch (error) {
    if (error instanceof ServiceError) return error;
    throw error;
  }
  throw new Error("expected a ServiceError");
}

// ---------- Funds ----------

// edge case: before the funds are entered there is nothing to show
test("funds are null until they are entered", () => {
  expect(service.getFunds()).toEqual({ entered: null, balance: null, totalSpent: 0, totalIncome: 0, totalLoss: 0 });
});

// normal case: entering funds saves them; entering again after spending takes the spending off
test("entering funds saves them, and re-entering takes off what was spent", () => {
  expect(service.setEntered({ entered: 2000 })).toMatchObject({ entered: 2000, balance: 2000, totalSpent: 0 });
  service.addExpense(DINNER);
  expect(service.setEntered({ entered: 3000 })).toMatchObject({ entered: 3000, balance: 2914, totalSpent: 86 });
  expect(db.prepare("SELECT entered, balance FROM available_funds").get()).toEqual({ entered: 3000, balance: 2914 });
});

// wrong case: entered funds must be a number of $0 or more (400)
test.each([[-1, "Available funds can't be negative."], ["2,000", "Available funds must be a number."], [undefined, "Available funds must be a number."]])(
  "rejects %p as the entered funds",
  (entered, message) => {
    const error = errorFrom(() => service.setEntered({ entered }));
    expect(error.status).toBe(400);
    expect(error.body).toEqual({ errors: { entered: message } });
  }
);

// wrong case: entering less than has been spent is a 409 and changes nothing
test("entering less than was spent is a 409", () => {
  service.setEntered({ entered: 500 });
  service.addExpense({ ...DINNER, amount: 300 });
  const error = errorFrom(() => service.setEntered({ entered: 299 }));
  expect(error.status).toBe(409);
  expect(error.body).toEqual({ error: "That's less than the spending you've recorded." });
  expect(service.getFunds()).toMatchObject({ entered: 500, balance: 200 });
});

// ---------- Recording, editing and removing spending ----------

// normal case: recording spending saves it and lowers the funds
test("recording spending lowers the funds", () => {
  service.setEntered({ entered: 1000 });
  const expense = service.addExpense({ ...DINNER, note: "  Dinner  " });
  expect(expense).toEqual({ id: expect.any(Number), ...DINNER });
  expect(service.getFunds()).toMatchObject({ balance: 914, totalSpent: 86 });
});

// edge case: the note and category are optional ("" and "other")
test("note and category have defaults", () => {
  service.setEntered({ entered: 1000 });
  expect(service.addExpense({ amount: 10, date: "2026-11-20" })).toMatchObject({ note: "", category: "other" });
});

// wrong case: spending before the funds are entered is a 409
test("spending can't be recorded before the funds are entered", () => {
  const error = errorFrom(() => service.addExpense(DINNER));
  expect(error.status).toBe(409);
  expect(error.body).toEqual({ error: "Enter your available funds first." });
});

// wrong case: invalid spending is a 400 with Expense's message for each field, and nothing is saved
test("rejects invalid spending with a message per field", () => {
  service.setEntered({ entered: 1000 });
  const error = errorFrom(() => service.addExpense({ amount: 0, date: "2026-11-26", note: "x".repeat(61), category: "pizza" }));
  expect(error.status).toBe(400);
  expect(error.body).toEqual({
    errors: {
      amount: "Spending amount must be more than $0.",
      date: "The date can't be in the future.",
      note: "Keep the note to 60 characters or fewer.",
      category: "Choose a category from the list.",
    },
  });
  expect(service.listExpenses()).toEqual([]);
});

// wrong case: spending more than the funds is a 409 and changes nothing
test("spending more than the funds is a 409", () => {
  service.setEntered({ entered: 50 });
  const error = errorFrom(() => service.addExpense(DINNER));
  expect(error.status).toBe(409);
  expect(error.body).toEqual({ error: "That's more than your available funds." });
  expect(service.getFunds().balance).toBe(50);
  expect(service.listExpenses()).toEqual([]);
});

// normal case: editing spending changes the funds by the difference and keeps the id
test("editing spending changes the funds by the difference", () => {
  service.setEntered({ entered: 1000 });
  const expense = service.addExpense(DINNER);
  const edited = service.updateExpense(String(expense.id), { ...DINNER, amount: 120, note: "Dinner + tip" });
  expect(edited).toEqual({ ...DINNER, id: expense.id, amount: 120, note: "Dinner + tip" });
  expect(service.getFunds().balance).toBe(880);
});

// wrong case: an edit that spends more than the funds is a 409 and changes nothing
test("an edit that spends more than the funds is a 409", () => {
  service.setEntered({ entered: 100 });
  const expense = service.addExpense(DINNER);
  expect(errorFrom(() => service.updateExpense(expense.id, { ...DINNER, amount: 101 })).status).toBe(409);
  expect(service.listExpenses()[0].amount).toBe(86);
  expect(service.getFunds().balance).toBe(14);
});

// normal case: removing spending adds its amount back
test("removing spending adds the amount back", () => {
  service.setEntered({ entered: 1000 });
  const expense = service.addExpense(DINNER);
  service.deleteExpense(expense.id);
  expect(service.listExpenses()).toEqual([]);
  expect(service.getFunds()).toMatchObject({ balance: 1000, totalSpent: 0 });
});

// wrong case: an unknown id, or one that isn't a whole number, is a 404 for edit and delete
test.each(["99", "abc", "0", ""])("treats the spending id %p as unknown", (id) => {
  service.setEntered({ entered: 1000 });
  service.addExpense(DINNER);
  for (const call of [() => service.updateExpense(id, DINNER), () => service.deleteExpense(id)]) {
    const error = errorFrom(call);
    expect(error.status).toBe(404);
    expect(error.body).toEqual({ error: "No spending with that id." });
  }
  expect(service.getFunds().balance).toBe(914);
});

// ---------- Filters ----------

describe("filters", () => {
  beforeEach(() => {
    service.setEntered({ entered: 5000 });
    service.addExpense({ amount: 1200, date: "2026-11-01", note: "Rent", category: "housing" });
    service.addExpense({ amount: 60, date: "2026-11-10", note: "Groceries", category: "food" });
    service.addExpense({ amount: 86, date: "2026-11-24", note: "Dinner with Sam", category: "food" });
    service.addExpense({ amount: 45, date: "2026-11-15", note: "100% cotton shirt", category: "shopping" });
  });

  const notes = (filters) => service.listExpenses(filters).map((e) => e.note);

  // normal case: no filters lists everything, oldest first
  test("lists all spending oldest first", () => {
    expect(notes()).toEqual(["Rent", "Groceries", "100% cotton shirt", "Dinner with Sam"]);
  });

  // normal case: each filter on its own, and filters together
  test("filters by category, date range and note", () => {
    expect(notes({ category: "food" })).toEqual(["Groceries", "Dinner with Sam"]);
    expect(notes({ from: "2026-11-10", to: "2026-11-15" })).toEqual(["Groceries", "100% cotton shirt"]);
    expect(notes({ search: "  DINNER " })).toEqual(["Dinner with Sam"]);
    expect(notes({ category: "food", from: "2026-11-20" })).toEqual(["Dinner with Sam"]);
  });

  // edge case: % in the search is matched as text, not as a wildcard
  test("search treats % as a character", () => {
    expect(notes({ search: "100%" })).toEqual(["100% cotton shirt"]);
    expect(notes({ search: "%" })).toEqual(["100% cotton shirt"]);
  });

  // wrong case: an unknown category, a date that isn't real, or an end before the start is a 400
  test("rejects invalid filters", () => {
    expect(errorFrom(() => service.listExpenses({ category: "pizza" })).body).toEqual({ errors: { category: "Choose a category from the list." } });
    expect(errorFrom(() => service.listExpenses({ from: "2026-02-30" })).body).toEqual({ errors: { from: "Choose a valid date." } });
    expect(errorFrom(() => service.listExpenses({ from: "2026-11-20", to: "2026-11-10" })).body)
      .toEqual({ errors: { to: "The end date can't be before the start date." } });
  });
});

// ---------- Start over ----------

// normal case: clearing the funds removes them and the spending recorded against them
test("clearFunds removes the funds and their spending", () => {
  service.setEntered({ entered: 1000 });
  service.addExpense(DINNER);
  service.clearFunds();
  expect(service.getFunds()).toEqual({ entered: null, balance: null, totalSpent: 0, totalIncome: 0, totalLoss: 0 });
  expect(service.listExpenses()).toEqual([]);
  expect(db.prepare("SELECT COUNT(*) AS n FROM expense").get().n).toBe(0);
});

// edge case: clearing funds that were never entered changes nothing
test("clearing funds that were never entered is fine", () => {
  expect(() => service.clearFunds()).not.toThrow();
  expect(service.getFunds().balance).toBeNull();
});