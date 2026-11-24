/* ============================================================
   FinancialGoal — one savings goal: a name, a target amount, a
   target date, how important it is (priority) and the smallest
   amount the user would still accept. Works out how much to set
   aside each month and whether a given monthly amount, plus any
   money already saved, is enough to get there in time.
   ============================================================ */

(function (global) {
  "use strict";

  let nextId = 1;

  class FinancialGoal {
    static MAX_NAME_LENGTH = 60;
    static MIN_PRIORITY = 1;       // least important
    static MAX_PRIORITY = 5;       // most important
    static DEFAULT_PRIORITY = 3;

    /* targetDate is a "YYYY-MM-DD" string, as an <input type="date"> gives it; asOf is "today".
       minAcceptableAmount of 0 means only the full amount counts. */
    constructor({
      id, name = "My goal", targetAmount, targetDate,
      priority = FinancialGoal.DEFAULT_PRIORITY, minAcceptableAmount = 0, asOf = new Date(),
    }) {
      const errors = FinancialGoal.validate({ name, targetAmount, targetDate, priority, minAcceptableAmount, asOf });
      const fields = Object.keys(errors);
      if (fields.length) throw new RangeError(errors[fields[0]]);
      this.id = id ?? "goal-" + nextId++;
      this.name = name.trim();
      this.targetAmount = targetAmount;
      this.targetDate = targetDate;
      this.priority = priority;
      this.minAcceptableAmount = minAcceptableAmount;
      Object.freeze(this);   // a goal can't be changed into an invalid one after it is checked
    }

    /* error message per invalid field; empty when everything is valid */
    static validate({
      name = "My goal", targetAmount, targetDate,
      priority = FinancialGoal.DEFAULT_PRIORITY, minAcceptableAmount = 0, asOf = new Date(),
    }) {
      const errors = {};
      if (typeof name !== "string" || name.trim() === "") {
        errors.name = "Give your goal a name.";
      } else if (name.trim().length > FinancialGoal.MAX_NAME_LENGTH) {
        errors.name = `Keep the name to ${FinancialGoal.MAX_NAME_LENGTH} characters or fewer.`;
      }

      const amountIsValid = typeof targetAmount === "number" && Number.isFinite(targetAmount) && targetAmount > 0;
      if (typeof targetAmount !== "number" || !Number.isFinite(targetAmount)) {
        errors.targetAmount = "Goal amount must be a number.";
      } else if (targetAmount <= 0) {
        errors.targetAmount = "Goal amount must be more than $0.";
      }

      const date = FinancialGoal.parseDate(targetDate);
      if (!date) errors.targetDate = "Choose a valid target date.";
      else if (date <= FinancialGoal.#startOfDay(asOf)) errors.targetDate = "Target date must be after today.";

      if (!Number.isInteger(priority) || priority < FinancialGoal.MIN_PRIORITY || priority > FinancialGoal.MAX_PRIORITY) {
        errors.priority = `Choose a priority from ${FinancialGoal.MIN_PRIORITY} to ${FinancialGoal.MAX_PRIORITY}.`;
      }

      // compared with the goal amount only when that is valid, so one mistake doesn't show two messages
      const minIsNumber = typeof minAcceptableAmount === "number" && Number.isFinite(minAcceptableAmount);
      if (!minIsNumber || minAcceptableAmount < 0 || (amountIsValid && minAcceptableAmount >= targetAmount)) {
        errors.minAcceptableAmount = "The smallest amount you'd accept must be $0 or more and less than the goal amount.";
      }
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

    /* what's left to save each month once `saved` (money the user already has for it) is counted;
       0 when the savings already cover the target */
    monthlySavingsRequired(asOf = new Date(), saved = 0) {
      FinancialGoal.#checkSaved(saved);
      return Math.max(0, this.targetAmount - saved) / this.monthsRemaining(asOf);
    }

    /* true when `saved` now plus `monthlySaving` a month adds up to the target by the target date,
       with no investment growth. A negative monthlySaving eats into the savings. */
    isOnTrack(monthlySaving, asOf = new Date(), saved = 0) {
      FinancialGoal.#checkSaving(monthlySaving);
      FinancialGoal.#checkSaved(saved);
      return monthlySaving >= (this.targetAmount - saved) / this.monthsRemaining(asOf);
    }

    /* months it takes to reach the target from `saved` at `monthlySaving` a month: 0 when the savings
       already cover it, Infinity when they don't and the saving is 0 or less */
    monthsToReach(monthlySaving, saved = 0) {
      FinancialGoal.#checkSaving(monthlySaving);
      FinancialGoal.#checkSaved(saved);
      if (saved >= this.targetAmount) return 0;
      if (monthlySaving <= 0) return Infinity;
      // round away floating-point noise first, so 17 / (17 / 7) is 7 months, not 8
      const months = Math.round(((this.targetAmount - saved) / monthlySaving) * 1e6) / 1e6;
      return Math.ceil(months);
    }

    /* Everything the goal check on the page shows, worked out here so the view only formats it.
       monthlySaving is what's left each month; saved is the money the user has now (0 or more).
       Assumes all of both go to this goal, with no investment growth. */
    check(monthlySaving, { saved = 0, asOf = new Date() } = {}) {
      const monthlyNeeded = this.monthlySavingsRequired(asOf, saved);
      const onTrack = this.isOnTrack(monthlySaving, asOf, saved);
      const putIn = Math.max(0, monthlySaving);
      return {
        saved,
        monthlySaving,
        monthlyNeeded,
        onTrack,
        monthsLeft: this.monthsRemaining(asOf),
        monthsToReach: this.monthsToReach(monthlySaving, saved),
        coveredBySavings: saved >= this.targetAmount,
        // the extra needed each month; 0 when on track
        monthlyGap: onTrack ? 0 : Math.max(0, monthlyNeeded - putIn),
        // share of the monthly amount needed that what's left each month covers, 0 to 1
        coverage: monthlyNeeded === 0 ? (onTrack ? 1 : 0) : Math.min(1, putIn / monthlyNeeded),
      };
    }

    static #checkSaving(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Monthly saving must be a number.");
    }

    static #checkSaved(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Savings must be a number.");
      if (value < 0) throw new RangeError("Savings can't be negative.");
    }

    static #startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = FinancialGoal;
  else global.FinancialGoal = FinancialGoal;
})(typeof window !== "undefined" ? window : globalThis);
