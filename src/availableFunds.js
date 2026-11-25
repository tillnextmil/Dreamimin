/* ============================================================
   AvailableFunds — the money the user has available for the
   goal, and the spending, income and losses recorded against
   it. Recording an Expense or a loss lowers the balance, income
   raises it, and removing one undoes its change. Also adds the
   spending up by category for the step 1 chart.
   ============================================================ */

(function (global) {
  "use strict";

  let nextId = 1;

  class AvailableFunds {
    #balance;
    #expenses = [];
    #events = [];

    /* balance is the funds available now, in dollars; id is made up when left out */
    constructor({ id, balance }) {
      const errors = AvailableFunds.validate({ balance });
      if (errors.balance) throw new RangeError(errors.balance);
      this.id = id ?? "funds-" + nextId++;
      this.#balance = balance;
    }

    /* error message per invalid field; empty when everything is valid */
    static validate({ balance }) {
      const errors = {};
      if (typeof balance !== "number" || !Number.isFinite(balance)) errors.balance = "Available funds must be a number.";
      else if (balance < 0) errors.balance = "Available funds can't be negative.";
      return errors;
    }

    /* the funds left now, after recorded spending, income and losses */
    get balance() {
      return this.#balance;
    }

    /* the recorded Expenses, oldest first; a copy, so changing it doesn't change the funds */
    get expenses() {
      const sorted = [...this.#expenses].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return Object.freeze(sorted);
    }

    /* the recorded income and losses (FundsEvents), oldest first; a copy that can't be changed */
    get events() {
      const sorted = [...this.#events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return Object.freeze(sorted);
    }

    get totalIncome() {
      return AvailableFunds.#total(this.#events.filter((e) => e.kind === "income"));
    }

    get totalLoss() {
      return AvailableFunds.#total(this.#events.filter((e) => e.kind === "loss"));
    }

    get totalSpent() {
      return AvailableFunds.#toCents(this.#expenses.reduce((sum, expense) => sum + expense.amount, 0));
    }

    /* The recorded spending added up per category, largest first: [{ category, amount, share }],
       where share is the part of all the spending (0 to 1). Only categories with spending are
       listed; an Expense without a category counts as "other". Equal amounts keep `order`, the
       categories' own order (Expense.CATEGORIES on the page). */
    spendingByCategory(order = []) {
      const totals = new Map();
      for (const { category = "other", amount } of this.#expenses) {
        totals.set(category, (totals.get(category) || 0) + amount);
      }
      const total = this.totalSpent;
      const rank = (category) => (order.includes(category) ? order.indexOf(category) : order.length);
      return [...totals]
        .map(([category, sum]) => {
          const amount = AvailableFunds.#toCents(sum);
          return { category, amount, share: amount / total };
        })
        .sort((a, b) => b.amount - a.amount || rank(a.category) - rank(b.category) || (a.category < b.category ? -1 : 1));
    }

    updateBalance(amount) {
      const errors = AvailableFunds.validate({ balance: amount });
      if (errors.balance) throw new RangeError(errors.balance);
      this.#balance = amount;
    }

    /* entered is the amount the user typed for their funds, before any recorded spending, income
       or losses; the balance becomes entered + income - losses - spending. Returns the new balance. */
    setEnteredAmount(entered) {
      const errors = AvailableFunds.validate({ balance: entered });
      if (errors.balance) throw new RangeError(errors.balance);
      const balance = AvailableFunds.#toCents(entered + this.totalIncome - this.totalLoss - this.totalSpent);
      if (balance < 0) throw new RangeError("That's less than the spending you've recorded.");
      this.#balance = balance;
      return this.#balance;
    }

    /* lowers the balance by the Expense's amount and keeps the Expense; returns the new balance */
    recordSpending(expense) {
      if (!AvailableFunds.#isExpense(expense)) throw new TypeError("Record an Expense.");
      if (expense.amount > this.#balance) throw new RangeError("That's more than your available funds.");
      this.#balance = AvailableFunds.#toCents(this.#balance - expense.amount);
      this.#expenses.push(expense);
      return this.#balance;
    }

    /* removes a recorded Expense and adds its amount back; returns the new balance */
    removeSpending(expenseId) {
      const index = this.#expenses.findIndex((expense) => expense.id === expenseId);
      if (index === -1) throw new RangeError("No spending with that id.");
      const [removed] = this.#expenses.splice(index, 1);
      this.#balance = AvailableFunds.#toCents(this.#balance + removed.amount);
      return this.#balance;
    }

    /* swaps a recorded Expense for its edited version (same id): the balance changes by the
       difference between the two amounts. Returns the new balance; changes nothing on an error. */
    editSpending(expenseId, edited) {
      const index = this.#expenses.findIndex((expense) => expense.id === expenseId);
      if (index === -1) throw new RangeError("No spending with that id.");
      if (!AvailableFunds.#isExpense(edited)) throw new TypeError("Record an Expense.");
      if (edited.id !== expenseId) throw new RangeError("The edited spending must keep its id.");
      const balance = AvailableFunds.#toCents(this.#balance + this.#expenses[index].amount - edited.amount);
      if (balance < 0) throw new RangeError("That's more than your available funds.");
      this.#expenses[index] = edited;
      this.#balance = balance;
      return this.#balance;
    }

    /* records income (raises the balance) or a loss (lowers it); returns the new balance */
    recordEvent(event) {
      if (!AvailableFunds.#isEvent(event)) throw new TypeError("Record income or a loss.");
      const balance = AvailableFunds.#toCents(this.#balance + AvailableFunds.#change(event));
      if (balance < 0) throw new RangeError("That's more than your available funds.");
      this.#events.push(event);
      this.#balance = balance;
      return this.#balance;
    }

    /* removes recorded income or a loss and undoes its change; returns the new balance */
    removeEvent(eventId) {
      const index = this.#events.findIndex((event) => event.id === eventId);
      if (index === -1) throw new RangeError("No income or loss with that id.");
      const balance = AvailableFunds.#toCents(this.#balance - AvailableFunds.#change(this.#events[index]));
      if (balance < 0) throw new RangeError("That would leave your available funds below $0.");
      this.#events.splice(index, 1);
      this.#balance = balance;
      return this.#balance;
    }

    /* swaps recorded income or a loss for its edited version (same id); the balance changes by the
       difference. Returns the new balance; changes nothing on an error. */
    editEvent(eventId, edited) {
      const index = this.#events.findIndex((event) => event.id === eventId);
      if (index === -1) throw new RangeError("No income or loss with that id.");
      if (!AvailableFunds.#isEvent(edited)) throw new TypeError("Record income or a loss.");
      if (edited.id !== eventId) throw new RangeError("The edited income or loss must keep its id.");
      const balance = AvailableFunds.#toCents(
        this.#balance - AvailableFunds.#change(this.#events[index]) + AvailableFunds.#change(edited)
      );
      if (balance < 0) {
        throw new RangeError(edited.kind === "loss"
          ? "That's more than your available funds."
          : "That would leave your available funds below $0.");
      }
      this.#events[index] = edited;
      this.#balance = balance;
      return this.#balance;
    }

    /* a FundsEvent has an id, a kind of income or loss, and an amount above 0 */
    static #isEvent(value) {
      return typeof value === "object" && value !== null && value.id !== undefined &&
        (value.kind === "income" || value.kind === "loss") &&
        typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount > 0;
    }

    /* how an event changes the balance: + for income, - for a loss */
    static #change(event) {
      return event.kind === "income" ? event.amount : -event.amount;
    }

    static #total(items) {
      return AvailableFunds.#toCents(items.reduce((sum, item) => sum + item.amount, 0));
    }

    /* an Expense has an id and an amount above 0; checking that shape means this file
       doesn't need src/expense.js to be loaded first */
    static #isExpense(value) {
      return typeof value === "object" && value !== null && value.id !== undefined &&
        typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount > 0;
    }

    /* rounds to whole cents, so 0.3 - 0.1 is 0.2 and not 0.19999999999999998 */
    static #toCents(amount) {
      return Math.round(amount * 100) / 100;
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = AvailableFunds;
  else global.AvailableFunds = AvailableFunds;
})(typeof window !== "undefined" ? window : globalThis);