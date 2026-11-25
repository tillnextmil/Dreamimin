/* ============================================================
   FundsEvent — money that comes in (income, such as a bonus)
   or goes out (a loss, such as a car repair) outside everyday
   spending: a kind, an amount, the date and an optional note.
   Recorded against AvailableFunds. The amount, date and note
   follow the same rules and messages as an Expense.
   ============================================================ */

(function (global) {
  "use strict";

  let nextId = 1;

  class FundsEvent {
    static KINDS = Object.freeze(["income", "loss"]);
    static MAX_NOTE_LENGTH = 60;

    /* date is a "YYYY-MM-DD" string; asOf is "today", so tests can fix the date */
    constructor({ id, kind, amount, date, note = "", asOf = new Date() }) {
      const errors = FundsEvent.validate({ kind, amount, date, note, asOf });
      const fields = Object.keys(errors);
      if (fields.length) throw new RangeError(errors[fields[0]]);
      this.id = id ?? "event-" + nextId++;
      this.kind = kind;
      this.amount = amount;
      this.date = date;
      this.note = String(note).trim();
      Object.freeze(this);   // a recorded event can't be changed afterwards
    }

    /* error message per invalid field; empty when everything is valid */
    static validate({ kind, amount, date, note = "", asOf = new Date() }) {
      const errors = {};
      if (!FundsEvent.KINDS.includes(kind)) errors.kind = "Choose income or loss.";

      if (typeof amount !== "number" || !Number.isFinite(amount)) errors.amount = "Spending amount must be a number.";
      else if (amount <= 0) errors.amount = "Spending amount must be more than $0.";

      const day = FundsEvent.parseDate(date);
      if (!day) errors.date = "Choose a valid date.";
      else if (day > FundsEvent.#startOfDay(asOf)) errors.date = "The date can't be in the future.";

      if (String(note).trim().length > FundsEvent.MAX_NOTE_LENGTH) {
        errors.note = `Keep the note to ${FundsEvent.MAX_NOTE_LENGTH} characters or fewer.`;
      }
      return errors;
    }

    /* +amount for income, -amount for a loss: how the event changes the funds */
    get change() {
      return this.kind === "income" ? this.amount : -this.amount;
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

  if (typeof module !== "undefined" && module.exports) module.exports = FundsEvent;
  else global.FundsEvent = FundsEvent;
})(typeof window !== "undefined" ? window : globalThis);