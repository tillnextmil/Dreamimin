/* ============================================================
   GoalProbability — the chance of reaching a goal, from 0 to 1.
   Turns it into a verdict (Realistic … Not realistic yet) and a
   percent for the page.
   ============================================================ */

(function (global) {
  "use strict";

  class GoalProbability {
    /* lowest probability for each verdict, highest first; tone picks the colour on the page */
    static VERDICTS = Object.freeze([
      Object.freeze({ min: 0.8, label: "Realistic", tone: "ok" }),
      Object.freeze({ min: 0.5, label: "Within reach", tone: "mid" }),
      Object.freeze({ min: 0.2, label: "A stretch", tone: "short" }),
      Object.freeze({ min: 0, label: "Not realistic yet", tone: "short" }),
    ]);

    /* the verdict counts as realistic from this probability up */
    static REALISTIC_FROM = 0.8;

    constructor(value) {
      if (typeof value !== "number" || Number.isNaN(value)) throw new TypeError("Probability must be a number.");
      if (value < 0 || value > 1) throw new RangeError("Probability must be between 0 and 1.");
      this.value = value;
      Object.freeze(this);
    }

    get verdict() {
      return GoalProbability.VERDICTS.find((v) => this.value >= v.min).label;
    }

    get tone() {
      return GoalProbability.VERDICTS.find((v) => this.value >= v.min).tone;
    }

    get isRealistic() {
      return this.value >= GoalProbability.REALISTIC_FROM;
    }

    /* whole percent, but never "0%" for a small chance or "100%" for one short of certain: 0.004 -> "<1%", 0.996 -> ">99%" */
    toPercent() {
      const pct = Math.round(this.value * 100);
      if (this.value > 0 && pct === 0) return "<1%";
      if (this.value < 1 && pct === 100) return ">99%";
      return pct + "%";
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = GoalProbability;
  else global.GoalProbability = GoalProbability;
})(typeof window !== "undefined" ? window : globalThis);
