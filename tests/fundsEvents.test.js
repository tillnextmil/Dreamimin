// Unit tests for recorded income and losses on the server: the SQL
// (server/repositories/fundsEventRepository.js) and the rules (server/services/fundsService.js).
// Author: Autiana Wallace

const { openDatabase, PROFILE_ID } = require("../server/db");
const FundsRepository = require("../server/repositories/fundsRepository");
const ExpenseRepository = require("../server/repositories/expenseRepository");
const FundsEventRepository = require("../server/repositories/fundsEventRepository");
const FundsService = require("../server/services/fundsService");
const ServiceError = require("../server/services/serviceError");

// Fixed "today" so results never depend on when the tests run.
const TODAY = new Date(2026, 10, 25);
const BONUS = { kind: "income", amount: 800, date: "2026-11-01", note: "Bonus" };
const REPAIR = { kind: "loss", amount: 300, date: "2026-11-10", note: "Car repair" };

let db, service;
beforeEach(() => {
  db = openDatabase(":memory:");
  service = new FundsService(
    new FundsRepository(db), new ExpenseRepository(db), new FundsEventRepository(db), { profileId: PROFILE_ID, now: () => TODAY }
  );
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

// normal case: income and losses are saved, change the funds, and show in the totals
test("records income and a loss and updates the funds", () => {
  service.setEntered({ entered: 1000 });
  expect(service.addEvent(BONUS)).toEqual({ id: expect.any(Number), ...BONUS });
  service.addEvent(REPAIR);
  expect(service.getFunds()).toEqual({ entered: 1000, balance: 1500, totalSpent: 0, totalIncome: 800, totalLoss: 300 });
  expect(db.prepare("SELECT balance FROM available_funds").get().balance).toBe(1500);
});

// normal case: the list is oldest first and can keep one kind
test("lists income and losses, optionally by kind", () => {
  service.setEntered({ entered: 1000 });
  service.addEvent(REPAIR);
  service.addEvent(BONUS);
  expect(service.listEvents().map((e) => e.note)).toEqual(["Bonus", "Car repair"]);
  expect(service.listEvents({ kind: "loss" }).map((e) => e.note)).toEqual(["Car repair"]);
  expect(errorFrom(() => service.listEvents({ kind: "gift" })).body).toEqual({ errors: { kind: "Choose income or loss." } });
});

// normal case: income can be spent, and entering the funds again counts it
test("income can be spent and counts when the funds are entered again", () => {
  service.setEntered({ entered: 0 });
  service.addEvent(BONUS);
  service.addExpense({ amount: 500, date: "2026-11-05", note: "Rent" });
  expect(service.getFunds().balance).toBe(300);
  expect(service.setEntered({ entered: 100 }).balance).toBe(400);
});

// normal case: editing changes the funds by the difference; deleting undoes the change
test("edits and deletes income or a loss", () => {
  service.setEntered({ entered: 1000 });
  const bonus = service.addEvent(BONUS);
  expect(service.updateEvent(String(bonus.id), { ...BONUS, amount: 1000 })).toMatchObject({ amount: 1000 });
  expect(service.getFunds().balance).toBe(2000);
  service.deleteEvent(bonus.id);
  expect(service.getFunds()).toMatchObject({ balance: 1000, totalIncome: 0 });
  expect(service.listEvents()).toEqual([]);
});

// edge case: the note is optional
test("the note defaults to empty", () => {
  service.setEntered({ entered: 1000 });
  expect(service.addEvent({ kind: "income", amount: 5, date: "2026-11-01" }).note).toBe("");
});

// wrong case: income or a loss before the funds are entered is a 409
test("income and losses need the funds entered first", () => {
  const error = errorFrom(() => service.addEvent(BONUS));
  expect(error.status).toBe(409);
  expect(error.body).toEqual({ error: "Enter your available funds first." });
});

// wrong case: invalid input is a 400 with a message per field
test("rejects invalid income or a loss with a message per field", () => {
  service.setEntered({ entered: 1000 });
  const error = errorFrom(() => service.addEvent({ kind: "gift", amount: -1, date: "2026-11-26" }));
  expect(error.status).toBe(400);
  expect(error.body).toEqual({
    errors: {
      kind: "Choose income or loss.",
      amount: "Spending amount must be more than $0.",
      date: "The date can't be in the future.",
    },
  });
});

// wrong case: rules that would leave the funds below $0 are a 409 and change nothing
test("a loss more than the funds, or removing spent income, is a 409", () => {
  service.setEntered({ entered: 100 });
  const tooBig = errorFrom(() => service.addEvent({ ...REPAIR, amount: 101 }));
  expect(tooBig.status).toBe(409);
  expect(tooBig.body).toEqual({ error: "That's more than your available funds." });

  const bonus = service.addEvent(BONUS);
  service.addExpense({ amount: 850, date: "2026-11-05", note: "Laptop" });
  const spent = errorFrom(() => service.deleteEvent(bonus.id));
  expect(spent.status).toBe(409);
  expect(spent.body).toEqual({ error: "That would leave your available funds below $0." });
  expect(errorFrom(() => service.updateEvent(bonus.id, { ...BONUS, amount: 700 })).status).toBe(409);
  expect(service.getFunds()).toMatchObject({ balance: 50, totalIncome: 800 });
});

// wrong case: an unknown id is a 404 for edit and delete
test.each(["99", "abc", "0"])("treats the id %p as unknown", (id) => {
  service.setEntered({ entered: 1000 });
  for (const call of [() => service.updateEvent(id, BONUS), () => service.deleteEvent(id)]) {
    const error = errorFrom(call);
    expect(error.status).toBe(404);
    expect(error.body).toEqual({ error: "No income or loss with that id." });
  }
});

// wrong case: the table's checks stop a bad kind or amount even if the service is skipped
test("the table rejects a bad kind or amount", () => {
  service.setEntered({ entered: 1000 });
  const events = new FundsEventRepository(db);
  const fundsId = db.prepare("SELECT funds_id FROM available_funds").get().funds_id;
  expect(() => events.create(fundsId, { ...BONUS, kind: "gift" })).toThrow();
  expect(() => events.create(fundsId, { ...BONUS, amount: 0 })).toThrow();
  expect(events.findAll(fundsId)).toEqual([]);
});