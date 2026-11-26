/* ============================================================
   UpgradeChoice — when extra money comes in, the two choices to
   compare (REQUIREMENTS.md, 17): raise one goal by that amount,
   or move to a safer strategy, one risk level lower. It builds
   the change to the planner's job for each, so
   MultiGoalPlanner.whatIf can show how each one changes every
   goal's chance before the user chooses (SPECIFICATIONS.md,
   item 19).
   ============================================================ */

(function (global) {
  "use strict";

  const toCents = (amount) => Math.round(amount * 100) / 100;

  class UpgradeChoice {
    static MIN_RISK_LEVEL = 1;

    /* error message per invalid field; empty when everything is valid. job is the planner's job
       ({ goals, maxRiskLevel, ... }); extra is the extra money in dollars; goalId the goal to raise */
    static validate(job, { extra, goalId }) {
      const errors = {};
      if (typeof extra !== "number" || !Number.isFinite(extra)) errors.extra = "Enter how much extra money came in.";
      else if (extra <= 0) errors.extra = "The extra money must be more than $0.";
      if (!job || !Array.isArray(job.goals) || !job.goals.some((g) => String(g.id) === String(goalId))) {
        errors.goalId = "Choose a goal to raise.";
      }
      return errors;
    }

    /* The two choices, each with the change to the planner's job:
         raise: { goalId, targetAmount, changes }  the goal's amount goes up by `extra`
         safer: { maxRiskLevel, changes }          one risk level lower, or null at the lowest level
       Throws a RangeError with the first message from validate. */
    static options(job, { extra, goalId }) {
      const errors = UpgradeChoice.validate(job, { extra, goalId });
      const fields = Object.keys(errors);
      if (fields.length) throw new RangeError(errors[fields[0]]);
      const goal = job.goals.find((g) => String(g.id) === String(goalId));
      const targetAmount = toCents(goal.targetAmount + extra);
      const raise = {
        goalId: goal.id,
        targetAmount,
        changes: { goals: job.goals.map((g) => (g === goal ? { ...g, targetAmount } : g)) },
      };
      const level = job.maxRiskLevel ?? 5;
      const safer = level > UpgradeChoice.MIN_RISK_LEVEL
        ? { maxRiskLevel: level - 1, changes: { maxRiskLevel: level - 1 } }
        : null;
      return { raise, safer };
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = UpgradeChoice;
  else global.UpgradeChoice = UpgradeChoice;
})(typeof window !== "undefined" ? window : globalThis);