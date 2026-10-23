/* ============================================================
   FinancialGoal — one savings goal: a name, a target amount and
   a target date. Works out how much to set aside each month and
   whether a given monthly amount is enough to get there in time.
   ============================================================ */

(function (global) {
  "use strict";

  let nextId = 1;

  class FinancialGoal {
    static MAX_NAME_LENGTH = 60;

    /* targetDate is a "YYYY-MM-DD" string, as an <input type="date"> gives it */
    constructor({ id, name = "My goal", targetAmount, targetDate }) {
      const errors = FinancialGoal.validate({ name, targetAmount, targetDate });
      const fields = Object.keys(errors);
      if (fields.length) throw new RangeError(errors[fields[0]]);
      this.id = id ?? "goal-" + nextId++;
      this.name = name.trim();
      this.targetAmount = targetAmount;
      this.targetDate = targetDate;
    }

    /* error message per invalid field; empty when everything is valid */
    static validate({ name = "My goal", targetAmount, targetDate, asOf = new Date() }) {
      const errors = {};
      if (typeof name !== "string" || name.trim() === "") {
        errors.name = "Give your goal a name.";
      } else if (name.trim().length > FinancialGoal.MAX_NAME_LENGTH) {
        errors.name = `Keep the name under ${FinancialGoal.MAX_NAME_LENGTH} characters.`;
      }

      if (typeof targetAmount !== "number" || !Number.isFinite(targetAmount)) {
        errors.targetAmount = "Goal amount must be a number.";
      } else if (targetAmount <= 0) {
        errors.targetAmount = "Goal amount must be more than $0.";
      }

      const date = FinancialGoal.parseDate(targetDate);
      if (!date) errors.targetDate = "Choose a valid target date.";
      else if (date <= FinancialGoal.#startOfDay(asOf)) errors.targetDate = "Target date must be after today.";
      return errors;
    }

    /* "2027-06-30" -> local Date, or null for anything that isn't a real calendar date */
    static parseDate(value) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
    }

    /* whole months of saving before the target date, counting one deposit a month from today; at least 1 */
    monthsRemaining(asOf = new Date()) {
      const date = FinancialGoal.parseDate(this.targetDate);
      const today = FinancialGoal.#startOfDay(asOf);
      if (date <= today) throw new RangeError("Target date must be after today.");
      let months = (date.getFullYear() - today.getFullYear()) * 12 + date.getMonth() - today.getMonth();
      if (date.getDate() < today.getDate()) months -= 1;   // the last month isn't complete yet
      return Math.max(1, months);
    }

    monthlySavingsRequired(asOf = new Date()) {
      return this.targetAmount / this.monthsRemaining(asOf);
    }

    /* true when saving `monthlySaving` a month reaches the target by the target date */
    isOnTrack(monthlySaving, asOf = new Date()) {
      FinancialGoal.#checkSaving(monthlySaving);
      return monthlySaving >= this.monthlySavingsRequired(asOf);
    }

    /* months it takes to reach the target at `monthlySaving` a month; Infinity when nothing is saved */
    monthsToReach(monthlySaving) {
      FinancialGoal.#checkSaving(monthlySaving);
      return monthlySaving > 0 ? Math.ceil(this.targetAmount / monthlySaving) : Infinity;
    }

    static #checkSaving(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Monthly saving must be a number.");
    }

    static #startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = FinancialGoal;
  else global.FinancialGoal = FinancialGoal;
})(typeof window !== "undefined" ? window : globalThis);
