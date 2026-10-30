/* ============================================================
   GoalAnalysisResult — what the PPO planner worked out for one
   goal: the chance of reaching it, the DP benchmark and RL
   efficiency, the portfolio for each year, and the range of
   outcomes. Built from the result PpoPlanner.plan returns.
   ============================================================ */

(function (global) {
  "use strict";

  const GoalProbability = typeof module !== "undefined" && module.exports
    ? require("./goalProbability")
    : global.GoalProbability;

  class GoalAnalysisResult {
    /* prob and dp are probabilities; p10/p50/p90 are wealth at the target date in a bad,
       typical and good market; glide[t] is the index in portfolios used in year t */
    constructor({ prob, dp, efficiency, p10, p50, p90, years, glide, portfolios }) {
      if (efficiency !== null && !(typeof efficiency === "number" && efficiency >= 0 && efficiency <= 1)) {
        throw new RangeError("RL efficiency must be between 0 and 1, or null.");
      }
      if (![p10, p50, p90].every((v) => typeof v === "number" && Number.isFinite(v))) {
        throw new TypeError("Outcomes must be numbers.");
      }
      if (!(p10 <= p50 && p50 <= p90)) throw new RangeError("Outcomes must be in order: p10 ≤ p50 ≤ p90.");
      if (!Number.isInteger(years) || years < 1) throw new RangeError("Years must be a whole number of at least 1.");
      if (!Array.isArray(portfolios) || portfolios.length === 0) throw new TypeError("Portfolios must be a list of names.");
      if (!Array.isArray(glide) || glide.length !== years) throw new RangeError("The glide path needs one portfolio per year.");
      if (!glide.every((j) => Number.isInteger(j) && j >= 0 && j < portfolios.length)) {
        throw new RangeError("Each year of the glide path must name one of the portfolios.");
      }

      this.probability = new GoalProbability(prob);
      this.benchmark = new GoalProbability(dp);
      this.efficiency = efficiency;   // null when the benchmark can't reach the goal
      this.outcomes = Object.freeze({ bad: p10, typical: p50, good: p90 });
      this.years = years;
      this.glide = Object.freeze([...glide]);
      this.portfolios = Object.freeze([...portfolios]);
      Object.freeze(this);
    }

    /* RL efficiency as a whole percent, or "–" when there is nothing to compare to */
    efficiencyText() {
      return this.efficiency === null ? "–" : Math.round(this.efficiency * 100) + "%";
    }

    /* runs of years on the same portfolio: [{ portfolio, firstYear, lastYear }], years counted from 0 */
    glideStages() {
      const stages = [];
      this.glide.forEach((j, t) => {
        const last = stages[stages.length - 1];
        if (last && last.portfolio === this.portfolios[j]) last.lastYear = t;
        else stages.push({ portfolio: this.portfolios[j], firstYear: t, lastYear: t });
      });
      return stages;
    }

    /* [3, 3, 2, 1] from 2026 -> "Growth until 2028, Balanced to 2029, then Conservative." */
    describeGlide(startYear) {
      const stages = this.glideStages();
      if (stages.length === 1) return `${stages[0].portfolio} the whole way.`;
      return stages.map((s, i) => {
        if (i === 0) return `${s.portfolio} until ${startYear + s.lastYear + 1}`;
        if (i === stages.length - 1) return `then ${s.portfolio}`;
        return `${s.portfolio} to ${startYear + s.lastYear + 1}`;
      }).join(", ") + ".";
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = GoalAnalysisResult;
  else global.GoalAnalysisResult = GoalAnalysisResult;
})(typeof window !== "undefined" ? window : globalThis);
