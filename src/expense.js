/* ============================================================
   Expense — one recorded spending: an amount, the date it was
   spent, a category and an optional note. Recorded against
   AvailableFunds.
   ============================================================ */

(function (global) {
  "use strict";

  let nextId = 1;

  class Expense {
    static MAX_NOTE_LENGTH = 60;
    /* the spending categories; the same list the expense table in server/schema.sql allows */
    static CATEGORIES = Object.freeze(["housing", "food", "transport", "bills", "health", "fun", "shopping", "other"]);

    /* date is a "YYYY-MM-DD" string, as an <input type="date"> gives it; asOf is "today" */
    constructor({ id, amount, date, note = "", category = "other", asOf = new Date() }) {
      const errors = Expense.validate({ amount, date, note, category, asOf });
      const fields = Object.keys(errors);
      if (fields.length) throw new RangeError(errors[fields[0]]);
      this.id = id ?? "expense-" + nextId++;
      this.amount = amount;
      this.date = date;
      this.note = String(note).trim();
      this.category = category;
      Object.freeze(this);   // a recorded spending can't be changed afterwards
    }

    /* error message per invalid field; empty when everything is valid */
    static validate({ amount, date, note = "", category = "other", asOf = new Date() }) {
      const errors = {};
      if (typeof amount !== "number" || !Number.isFinite(amount)) errors.amount = "Spending amount must be a number.";
      else if (amount <= 0) errors.amount = "Spending amount must be more than $0.";

      const day = Expense.parseDate(date);
      if (!day) errors.date = "Choose a valid date.";
      else if (day > Expense.#startOfDay(asOf)) errors.date = "The date can't be in the future.";

      if (String(note).trim().length > Expense.MAX_NOTE_LENGTH) {
        errors.note = `Keep the note to ${Expense.MAX_NOTE_LENGTH} characters or fewer.`;
      }

      if (!Expense.CATEGORIES.includes(category)) errors.category = "Choose a category from the list.";
      return errors;
    }

    /* "2026-10-15" -> local Date, or null for anything that isn't a real calendar date */
    static parseDate(value) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
    }

    static #startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = Expense;
  else global.Expense = Expense;
})(typeof window !== "undefined" ? window : globalThis);