/* ============================================================
   MultiGoalPlan — what the planner worked out for all the goals
   together at one risk level: each goal's chance of being reached
   in full or in part with its verdict, the plan's utility against
   the DP benchmark, and the risk level held each year, which it
   can describe as stages ("Balanced until 2028, then Cautious.").
   Built from the result MultiGoalPlanner.plan returns; toJSON()
   gives the body POST /api/plans takes (SPECIFICATIONS.md, item 12).
   ============================================================ */

(function (global) {
  "use strict";

  const GoalProbability = typeof module !== "undefined" && module.exports
    ? require("./goalProbability")
    : global.GoalProbability;

  const MAX_RISK_LEVEL = 5, MAX_YEARS = 40;
  const isRiskLevel = (level) => Number.isInteger(level) && level >= 1 && level <= MAX_RISK_LEVEL;

  function checkUtility(value) {
    if (!(typeof value === "number" && Number.isFinite(value) && value >= 0)) throw new RangeError("Utility must be a number of 0 or more.");
    return value;
  }

  /* The rules, one per field, in the order the constructor applies them. Each throws when its field
     is wrong (a RangeError, or a TypeError for a chance or portfolio names of the wrong type) and
     returns the value to keep. validate() runs them all for a message per field. */
  const CHECKS = {
    maxRiskLevel({ maxRiskLevel }) {
      if (!isRiskLevel(maxRiskLevel)) throw new RangeError(`Choose a risk level from 1 to ${MAX_RISK_LEVEL}.`);
      return maxRiskLevel;
    },
    utility: ({ utility }) => checkUtility(utility),
    dpUtility: ({ dpUtility }) => checkUtility(dpUtility),
    rlEfficiency({ rlEfficiency }) {
      if (rlEfficiency !== null && !(typeof rlEfficiency === "number" && rlEfficiency >= 0 && rlEfficiency <= 1)) {
        throw new RangeError("RL efficiency must be between 0 and 1, or null.");
      }
      return rlEfficiency;
    },
    riskLevelByYear({ riskLevelByYear, maxRiskLevel }) {
      if (!Array.isArray(riskLevelByYear) || riskLevelByYear.length < 1 || riskLevelByYear.length > MAX_YEARS) {
        throw new RangeError(`A plan covers 1 to ${MAX_YEARS} years.`);
      }
      const cap = isRiskLevel(maxRiskLevel) ? maxRiskLevel : MAX_RISK_LEVEL;   // a bad risk level has its own message
      if (!riskLevelByYear.every((level) => Number.isInteger(level) && level >= 1 && level <= cap)) {
        throw new RangeError("Each year's risk level must be from 1 up to the plan's risk level.");
      }
      return Object.freeze([...riskLevelByYear]);
    },
    goals({ goals }) {
      if (!Array.isArray(goals) || goals.length === 0) throw new RangeError("A plan needs at least one goal.");
      const results = goals.map((goal) => {
        const { goalId, pFull, pPartial } = goal || {};
        if (typeof goalId !== "string" && typeof goalId !== "number") throw new RangeError("Every goal needs an id.");
        const full = new GoalProbability(pFull), partial = new GoalProbability(pPartial);
        if (pFull + pPartial > 1 + 1e-9) throw new RangeError("A goal's full and partial chances can't add up to more than 1.");
        const chance = new GoalProbability(Math.min(1, pFull + pPartial));   // reached in full or in part
        return Object.freeze({ goalId, full, partial, chance, verdict: chance.verdict });
      });
      if (new Set(results.map((r) => r.goalId)).size !== results.length) throw new RangeError("Two goals can't share an id.");
      return Object.freeze(results);
    },
    portfolios({ portfolios = null }) {
      if (portfolios !== null && !(Array.isArray(portfolios) && portfolios.length === MAX_RISK_LEVEL
          && portfolios.every((name) => typeof name === "string" && name.trim() !== ""))) {
        throw new TypeError(`Portfolios must be ${MAX_RISK_LEVEL} names, lowest risk first.`);
      }
      return portfolios && Object.freeze([...portfolios]);
    },
  };

  class MultiGoalPlan {
    /* result: { maxRiskLevel, utility, dpUtility, rlEfficiency, riskLevelByYear, goals, portfolios }.
       goals: [{ goalId, pFull, pPartial }], the chance of reaching the full amount and the chance
       of only reaching the smallest acceptable amount; riskLevelByYear[y] is the risk level in year y;
       rlEfficiency is null when the benchmark can't reach any goal; portfolios, when given, names
       the portfolio at each risk level, lowest first. Throws on the first rule a field breaks. */
    constructor(result) {
      const input = result || {};
      for (const [field, check] of Object.entries(CHECKS)) this[field] = check(input);
      Object.freeze(this);
    }

    /* error message per invalid field (the API's 400 body); empty when the result is valid */
    static validate(result) {
      const errors = {};
      for (const [field, check] of Object.entries(CHECKS)) {
        try {
          check(result || {});
        } catch (error) {
          errors[field] = error.message;
        }
      }
      return errors;
    }

    /* how many goals have a Realistic verdict */
    realisticCount() {
      return this.goals.filter((r) => r.chance.isRealistic).length;
    }

    /* runs of years at the same risk level: [{ portfolio, firstYear, lastYear }], years counted from 0;
       portfolio is the level's name, or "Risk level n" without names */
    glideStages() {
      const name = (level) => (this.portfolios ? this.portfolios[level - 1] : `Risk level ${level}`);
      const stages = [];
      this.riskLevelByYear.forEach((level, year) => {
        const last = stages[stages.length - 1];
        if (last && last.portfolio === name(level)) last.lastYear = year;
        else stages.push({ portfolio: name(level), firstYear: year, lastYear: year });
      });
      return stages;
    }

    /* [3, 3, 2, 1] from 2026 -> "Balanced until 2028, Conservative to 2029, then Cautious." */
    describeGlide(startYear) {
      const stages = this.glideStages();
      if (stages.length === 1) return `${stages[0].portfolio} the whole way.`;
      return stages.map((s, i) => {
        if (i === 0) return `${s.portfolio} until ${startYear + s.lastYear + 1}`;
        if (i === stages.length - 1) return `then ${s.portfolio}`;
        return `${s.portfolio} to ${startYear + s.lastYear + 1}`;
      }).join(", ") + ".";
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
