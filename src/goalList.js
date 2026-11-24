/* ============================================================
   GoalList — the rules for a user's list of goals: how many
   there can be, how the list is sorted and searched, and which
   goals the planner can plan together
   (SPECIFICATIONS.md, item 12). Works on plain goal objects in
   the API's shape ({ id, name, targetAmount, targetDate,
   priority, ... }), so the page's API client and the server's
   GoalService can share it.
   ============================================================ */

(function (global) {
  "use strict";

  const FinancialGoal = typeof module !== "undefined" && module.exports
    ? require("./financialGoal")
    : global.FinancialGoal;

  /* how each sort orders two goals; ties fall back to the soonest date, then the oldest goal */
  const bySoonest = (a, b) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0);
  const byOldest = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ORDERS = {
    date: (a, b) => bySoonest(a, b),
    priority: (a, b) => b.priority - a.priority || bySoonest(a, b),             // most important first
    amount: (a, b) => b.targetAmount - a.targetAmount || bySoonest(a, b),     // largest first
    name: (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || bySoonest(a, b),   // A to Z
  };

  class GoalList {
    static MAX_GOALS = 20;                 // the most goals the planner takes
    static SORTS = Object.freeze(Object.keys(ORDERS));
    static DEFAULT_SORT = "date";
    static TOO_MANY = `You can have up to ${GoalList.MAX_GOALS} goals.`;
    static BAD_SORT = "Sort by date, priority, amount or name.";
    static MAX_YEARS = 40;                 // the furthest ahead the planner looks
    static DATE_PASSED = "Its date has passed.";
    static TOO_FAR = `It's more than ${GoalList.MAX_YEARS} years away.`;

    /* the error message for a sort that isn't one of SORTS, or null when it's fine */
    static checkSort(sort) {
      return GoalList.SORTS.includes(sort) ? null : GoalList.BAD_SORT;
    }

    /* true while another goal can still be added to a list of `count` goals */
    static canAdd(count) {
      return count < GoalList.MAX_GOALS;
    }

    /* a new array: the goals whose name contains `search` (ignoring case and surrounding spaces),
       in the order `sort` gives. Throws a RangeError for an unknown sort. */
    static arrange(goals, { sort = GoalList.DEFAULT_SORT, search = "" } = {}) {
      const problem = GoalList.checkSort(sort);
      if (problem) throw new RangeError(problem);
      const wanted = String(search).trim().toLowerCase();
      return goals
        .filter((goal) => goal.name.toLowerCase().includes(wanted))
        .sort((a, b) => ORDERS[sort](a, b) || byOldest(a, b));
    }

    /* Splits goals into the ones the planner can plan together and the ones it can't, both soonest
       first. planned: each goal with `months`, the whole months until its date (FinancialGoal's
       monthsRemaining); left: each goal with the `reason` it can't be planned (its date has passed,
       or it is more than MAX_YEARS away). asOf is "today". */
    static forPlanner(goals, asOf = new Date()) {
      const planned = [], left = [];
      for (const saved of GoalList.arrange(goals)) {
        const errors = FinancialGoal.validate({ ...saved, asOf });
        const problem = Object.values(errors)[0];
        if (problem) {
          left.push({ ...saved, reason: errors.targetDate ? GoalList.DATE_PASSED : problem });
          continue;
        }
        const months = new FinancialGoal({ ...saved, asOf }).monthsRemaining(asOf);
        if (months > GoalList.MAX_YEARS * 12) left.push({ ...saved, reason: GoalList.TOO_FAR });
        else planned.push({ ...saved, months });
      }
      return { planned, left };
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = GoalList;
  else global.GoalList = GoalList;
})(typeof window !== "undefined" ? window : globalThis);
