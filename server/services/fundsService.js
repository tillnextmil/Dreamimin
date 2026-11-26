/* ============================================================
   FundsService: the user's available funds, and the spending,
   income and losses recorded against them (SPECIFICATIONS.md,
   items 11 and 12). Every change goes through an AvailableFunds
   built from what is saved, so the server follows the same rules
   as the page: Expense and FundsEvent check each item, and
   AvailableFunds keeps the funds from going below $0. Anything
   the request gets wrong is thrown as a ServiceError.
   ============================================================ */

const AvailableFunds = require("../../src/availableFunds");
const Expense = require("../../src/expense");
const FundsEvent = require("../../src/fundsEvent");
const ServiceError = require("./serviceError");

const NO_FUNDS = "Enter your available funds first.";
const NOT_FOUND = "No spending with that id.";
const EVENT_NOT_FOUND = "No income or loss with that id.";

class FundsService {
  /* now gives "today", so tests can fix the date that spending can't be after */
  constructor(fundsRepository, expenseRepository, eventRepository, { profileId, now = () => new Date() }) {
    this.funds = fundsRepository;
    this.expenses = expenseRepository;
    this.events = eventRepository;
    this.profileId = profileId;
    this.now = now;
  }

  /* { entered, balance, totalSpent, totalIncome, totalLoss }; entered and balance are null until the first PUT */
  getFunds() {
    const saved = this.funds.find(this.profileId);
    if (!saved) return { entered: null, balance: null, totalSpent: 0, totalIncome: 0, totalLoss: 0 };
    const funds = this.#load(saved);
    return {
      entered: saved.entered,
      balance: funds.balance,
      totalSpent: funds.totalSpent,
      totalIncome: funds.totalIncome,
      totalLoss: funds.totalLoss,
    };
  }

  /* sets the funds from what the user entered; the income, losses and spending already recorded count too */
  setEntered(input) {
    const { entered } = FundsService.#body(input);
    const problem = AvailableFunds.validate({ balance: entered }).balance;
    if (problem) throw ServiceError.invalid({ entered: problem });
    const saved = this.funds.find(this.profileId);
    const funds = saved ? this.#load(saved) : new AvailableFunds({ balance: entered });
    FundsService.#asConflict(() => funds.setEnteredAmount(entered));
    this.funds.save(this.profileId, { entered, balance: funds.balance });
    return this.getFunds();
  }
  
  /* Start over, or the Available funds field emptied: removes the funds and everything recorded
     against them, so the funds are null again until the next PUT */
  clearFunds() {
    this.funds.remove(this.profileId);
  }

  /* the recorded spending, oldest first, filtered by category, date range and note text */
  listExpenses({ category, from, to, search } = {}) {
    const errors = {};
    if (category !== undefined && !Expense.CATEGORIES.includes(category)) errors.category = "Choose a category from the list.";
    if (from !== undefined && !Expense.parseDate(from)) errors.from = "Choose a valid date.";
    if (to !== undefined && !Expense.parseDate(to)) errors.to = "Choose a valid date.";
    if (!errors.from && !errors.to && from !== undefined && to !== undefined && from > to) {
      errors.to = "The end date can't be before the start date.";
    }
    if (Object.keys(errors).length) throw ServiceError.invalid(errors);
    const saved = this.funds.find(this.profileId);
    if (!saved) return [];
    return this.expenses.findAll(saved.id, { category, from, to, search: search === undefined ? "" : String(search).trim() });
  }

  /* records spending and lowers the funds */
  addExpense(input) {
    const saved = this.#savedFunds();
    const fields = this.#checked(input);
    const funds = this.#load(saved);
    FundsService.#asConflict(() => funds.recordSpending({ id: "new", ...fields }));
    return this.funds.transaction(() => {
      this.funds.updateBalance(saved.id, funds.balance);
      return this.expenses.create(saved.id, fields);
    });
  }

  /* edits spending; the funds change by the difference */
  updateExpense(id, input) {
    const saved = this.#savedFunds();
    const current = this.#findExpense(saved.id, id);
    const fields = this.#checked(input);
    const funds = this.#load(saved);
    FundsService.#asConflict(() => funds.editSpending(current.id, { id: current.id, ...fields }));
    return this.funds.transaction(() => {
      this.funds.updateBalance(saved.id, funds.balance);
      return this.expenses.update(saved.id, current.id, fields);
    });
  }

  /* removes spending and adds its amount back to the funds */
  deleteExpense(id) {
    const saved = this.#savedFunds();
    const current = this.#findExpense(saved.id, id);
    const funds = this.#load(saved);
    funds.removeSpending(current.id);
    this.funds.transaction(() => {
      this.funds.updateBalance(saved.id, funds.balance);
      this.expenses.remove(saved.id, current.id);
    });
  }

  /* the recorded income and losses, oldest first; kind ("income" or "loss") is optional */
  listEvents({ kind } = {}) {
    if (kind !== undefined && !FundsEvent.KINDS.includes(kind)) throw ServiceError.invalid({ kind: "Choose income or loss." });
    const saved = this.funds.find(this.profileId);
    return saved ? this.events.findAll(saved.id, { kind }) : [];
  }

  /* records income (raises the funds) or a loss (lowers them) */
  addEvent(input) {
    const saved = this.#savedFunds();
    const fields = this.#checkedEvent(input);
    const funds = this.#load(saved);
    FundsService.#asConflict(() => funds.recordEvent({ id: "new", ...fields }));
    return this.funds.transaction(() => {
      this.funds.updateBalance(saved.id, funds.balance);
      return this.events.create(saved.id, fields);
    });
  }

  /* edits income or a loss; the funds change by the difference */
  updateEvent(id, input) {
    const saved = this.#savedFunds();
    const current = this.#findEvent(saved.id, id);
    const fields = this.#checkedEvent(input);
    const funds = this.#load(saved);
    FundsService.#asConflict(() => funds.editEvent(current.id, { id: current.id, ...fields }));
    return this.funds.transaction(() => {
      this.funds.updateBalance(saved.id, funds.balance);
      return this.events.update(saved.id, current.id, fields);
    });
  }

  /* removes income or a loss and undoes its change to the funds */
  deleteEvent(id) {
    const saved = this.#savedFunds();
    const current = this.#findEvent(saved.id, id);
    const funds = this.#load(saved);
    FundsService.#asConflict(() => funds.removeEvent(current.id));
    this.funds.transaction(() => {
      this.funds.updateBalance(saved.id, funds.balance);
      this.events.remove(saved.id, current.id);
    });
  }

  /* the saved funds; spending, income and losses can only be recorded once they're entered (409) */
  #savedFunds() {
    const saved = this.funds.find(this.profileId);
    if (!saved) throw ServiceError.conflict(NO_FUNDS);
    return saved;
  }

  /* an AvailableFunds holding what's saved: the entered amount, with each income, loss and spending
     recorded against it. Income goes first, so the order the rest was recorded in never matters. */
  #load(saved) {
    const funds = new AvailableFunds({ id: saved.id, balance: saved.entered });
    const events = this.events.findAll(saved.id);
    for (const event of events.filter((e) => e.kind === "income")) funds.recordEvent(event);
    for (const event of events.filter((e) => e.kind === "loss")) funds.recordEvent(event);
    for (const expense of this.expenses.findAll(saved.id)) funds.recordSpending(expense);
    return funds;
  }

  /* the income or loss with that id; an id that isn't a whole number is treated as unknown */
  #findEvent(fundsId, id) {
    const eventId = /^[1-9]\d*$/.test(String(id)) ? Number(id) : null;
    const event = eventId === null ? null : this.events.findById(fundsId, eventId);
    if (!event) throw ServiceError.notFound(EVENT_NOT_FOUND);
    return event;
  }

  /* kind, amount, date and note checked by FundsEvent, with its defaults; other fields are ignored */
  #checkedEvent(input) {
    const body = FundsService.#body(input);
    const fields = { kind: body.kind, amount: body.amount, date: body.date, note: body.note === undefined ? "" : body.note };
    const errors = FundsEvent.validate({ ...fields, asOf: this.now() });
    if (Object.keys(errors).length) throw ServiceError.invalid(errors);
    return { ...fields, note: String(fields.note).trim() };
  }

  /* the spending with that id; an id that isn't a whole number is treated as unknown */
  #findExpense(fundsId, id) {
    const expenseId = /^[1-9]\d*$/.test(String(id)) ? Number(id) : null;
    const expense = expenseId === null ? null : this.expenses.findById(fundsId, expenseId);
    if (!expense) throw ServiceError.notFound(NOT_FOUND);
    return expense;
  }

  /* amount, date, note and category checked by Expense, with its defaults; other fields are ignored */
  #checked(input) {
    const body = FundsService.#body(input);
    const fields = {
      amount: body.amount,
      date: body.date,
      note: body.note === undefined ? "" : body.note,
      category: body.category === undefined ? "other" : body.category,
    };
    const errors = Expense.validate({ ...fields, asOf: this.now() });
    if (Object.keys(errors).length) throw ServiceError.invalid(errors);
    return { ...fields, note: String(fields.note).trim() };
  }

  static #body(input) {
    return input && typeof input === "object" && !Array.isArray(input) ? input : {};
  }

  /* AvailableFunds throws a RangeError when a change would leave the funds below $0: that's a 409 */
  static #asConflict(change) {
    try {
      return change();
    } catch (error) {
      if (error instanceof RangeError) throw ServiceError.conflict(error.message);
      throw error;
    }
  }
}

module.exports = FundsService;