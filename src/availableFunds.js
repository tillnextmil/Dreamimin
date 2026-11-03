/* ============================================================
   AvailableFunds — the money the user has available for the
   goal, and the spending recorded against it. Recording an
   Expense lowers the balance; removing it adds the amount back.
   ============================================================ */

(function (global) {
  "use strict";

  let nextId = 1;

  class AvailableFunds {
    #balance;
    #expenses = [];

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

    /* the funds left now, after recorded spending */
    get balance() {
      return this.#balance;
    }

    /* the recorded Expenses, oldest first; a copy, so changing it doesn't change the funds */
    get expenses() {
      const sorted = [...this.#expenses].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return Object.freeze(sorted);
    }

    get totalSpent() {
      return AvailableFunds.#toCents(this.#expenses.reduce((sum, expense) => sum + expense.amount, 0));
    }

    updateBalance(amount) {
      const errors = AvailableFunds.validate({ balance: amount });
      if (errors.balance) throw new RangeError(errors.balance);
      this.#balance = amount;
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