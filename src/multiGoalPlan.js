/* ============================================================
   MultiGoalPlan — what the planner worked out for all the goals
   together at one risk level: each goal's chance of being reached
   in full or in part with its verdict, the plan's utility against
   the DP benchmark, and the risk level held each year.
   Built from the result MultiGoalPlanner.plan returns; toJSON()
   gives the body POST /api/plans takes (SPECIFICATIONS.md, item 12).
   ============================================================ */

(function (global) {
  "use strict";

  const GoalProbability = typeof module !== "undefined" && module.exports
    ? require("./goalProbability")
    : global.GoalProbability;

  const MAX_RISK_LEVEL = 5, MAX_YEARS = 40;

  class MultiGoalPlan {
    /* goals: [{ goalId, pFull, pPartial }], the chance of reaching the full amount and the chance
       of only reaching the smallest acceptable amount; riskLevelByYear[y] is the risk level in year y */
    constructor({ maxRiskLevel, utility, dpUtility, rlEfficiency, riskLevelByYear, goals }) {
      if (!Number.isInteger(maxRiskLevel) || maxRiskLevel < 1 || maxRiskLevel > MAX_RISK_LEVEL) {
        throw new RangeError(`Choose a risk level from 1 to ${MAX_RISK_LEVEL}.`);
      }
      const isUtility = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
      if (!isUtility(utility) || !isUtility(dpUtility)) throw new RangeError("Utility must be a number of 0 or more.");
      if (rlEfficiency !== null && !(typeof rlEfficiency === "number" && rlEfficiency >= 0 && rlEfficiency <= 1)) {
        throw new RangeError("RL efficiency must be between 0 and 1, or null.");
      }
      if (!Array.isArray(riskLevelByYear) || riskLevelByYear.length < 1 || riskLevelByYear.length > MAX_YEARS) {
        throw new RangeError(`A plan covers 1 to ${MAX_YEARS} years.`);
      }
      if (!riskLevelByYear.every((level) => Number.isInteger(level) && level >= 1 && level <= maxRiskLevel)) {
        throw new RangeError("Each year's risk level must be from 1 up to the plan's risk level.");
      }
      if (!Array.isArray(goals) || goals.length === 0) throw new RangeError("A plan needs at least one goal.");

      const results = goals.map(({ goalId, pFull, pPartial }) => {
        if (typeof goalId !== "string" && typeof goalId !== "number") throw new RangeError("Every goal needs an id.");
        const full = new GoalProbability(pFull), partial = new GoalProbability(pPartial);
        if (pFull + pPartial > 1 + 1e-9) throw new RangeError("A goal's full and partial chances can't add up to more than 1.");
        const chance = new GoalProbability(Math.min(1, pFull + pPartial));   // reached in full or in part
        return Object.freeze({ goalId, full, partial, chance, verdict: chance.verdict });
      });
      if (new Set(results.map((r) => r.goalId)).size !== results.length) throw new RangeError("Two goals can't share an id.");

      this.maxRiskLevel = maxRiskLevel;
      this.utility = utility;
      this.dpUtility = dpUtility;
      this.rlEfficiency = rlEfficiency;   // null when the benchmark can't reach any goal
      this.riskLevelByYear = Object.freeze([...riskLevelByYear]);
      this.goals = Object.freeze(results);
      Object.freeze(this);
    }

    /* the result for one goal, or undefined when the plan doesn't have it */
    goal(goalId) {
      return this.goals.find((r) => r.goalId === goalId);
    }

    /* RL efficiency as a whole percent, or "–" when there is nothing to compare to */
    efficiencyText() {
      return this.rlEfficiency === null ? "–" : Math.round(this.rlEfficiency * 100) + "%";
    }

    /* the body POST /api/plans takes */
    toJSON() {
      return {
        maxRiskLevel: this.maxRiskLevel,
        utility: this.utility,
        dpUtility: this.dpUtility,
        rlEfficiency: this.rlEfficiency,
        riskLevelByYear: [...this.riskLevelByYear],
        goals: this.goals.map((r) => ({ goalId: r.goalId, pFull: r.full.value, pPartial: r.partial.value })),
      };
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = MultiGoalPlan;
  else global.MultiGoalPlan = MultiGoalPlan;
})(typeof window !== "undefined" ? window : globalThis);
