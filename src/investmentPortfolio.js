/* ============================================================
   InvestmentPortfolio — one of the five investment options the
   plan chooses from, from low risk (1) to high risk (5).
   Stores the expected yearly return and the volatility (how much
   it can rise or fall in a year), both after inflation.
   ============================================================ */

(function (global) {
  "use strict";

  class InvestmentPortfolio {
    /* the five risk levels, lowest risk first; the same numbers PpoPlanner uses */
    static RISK_LEVELS = Object.freeze([
      Object.freeze({ riskLevel: 1, name: "Cautious",     expectedReturn: 0.015, volatility: 0.05 }),
      Object.freeze({ riskLevel: 2, name: "Conservative", expectedReturn: 0.025, volatility: 0.08 }),
      Object.freeze({ riskLevel: 3, name: "Balanced",     expectedReturn: 0.037, volatility: 0.115 }),
      Object.freeze({ riskLevel: 4, name: "Growth",       expectedReturn: 0.047, volatility: 0.15 }),
      Object.freeze({ riskLevel: 5, name: "Aggressive",   expectedReturn: 0.057, volatility: 0.19 }),
    ]);

    constructor({ riskLevel, name, expectedReturn, volatility }) {
      const errors = InvestmentPortfolio.validate({ riskLevel, name, expectedReturn, volatility });
      const fields = Object.keys(errors);
      if (fields.length) throw new RangeError(errors[fields[0]]);
      this.riskLevel = riskLevel;
      this.name = name;
      this.expectedReturn = expectedReturn;
      this.volatility = volatility;
      Object.freeze(this);   // a portfolio can't be changed after it is checked
    }

    /* error message per invalid field; empty when everything is valid */
    static validate({ riskLevel, name, expectedReturn, volatility }) {
      const errors = {};
      const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
      if (!Number.isInteger(riskLevel) || riskLevel < 1 || riskLevel > 5) {
        errors.riskLevel = "Risk level must be a whole number from 1 to 5.";
      }
      if (typeof name !== "string" || name.trim() === "") errors.name = "Give the portfolio a name.";
      if (!isNumber(expectedReturn)) errors.expectedReturn = "Expected return must be a number.";
      else if (expectedReturn <= -1 || expectedReturn >= 1) errors.expectedReturn = "Expected return must be between -100% and 100%.";
      if (!isNumber(volatility)) errors.volatility = "Volatility must be a number.";
      else if (volatility < 0 || volatility >= 1) errors.volatility = "Volatility must be from 0% up to 100%.";
      return errors;
    }

    /* all five portfolios, lowest risk first */
    static all() {
      return InvestmentPortfolio.RISK_LEVELS.map((level) => new InvestmentPortfolio(level));
    }

    /* the portfolio for a risk level from 1 to 5 */
    static fromRiskLevel(riskLevel) {
      const level = InvestmentPortfolio.RISK_LEVELS.find((l) => l.riskLevel === riskLevel);
      if (!level) throw new RangeError("Risk level must be a whole number from 1 to 5.");
      return new InvestmentPortfolio(level);
    }

    /* 0.037 -> "3.7%"; rounding to one decimal hides floating-point error (0.115 * 100 is 11.500000000000002) */
    static toPercent(value) {
      return Math.round(value * 1000) / 10 + "%";
    }

    get expectedReturnPercent() {
      return InvestmentPortfolio.toPercent(this.expectedReturn);
    }

    get volatilityPercent() {
      return InvestmentPortfolio.toPercent(this.volatility);
    }

    /* where an amount would typically end up after one year: expected return minus and plus one volatility */
    typicalYearRange(amount) {
      if (typeof amount !== "number" || !Number.isFinite(amount)) throw new TypeError("Amount must be a number.");
      if (amount < 0) throw new RangeError("Amount can't be negative.");
      return {
        low: amount * (1 + this.expectedReturn - this.volatility),
        high: amount * (1 + this.expectedReturn + this.volatility),
      };
    }

    /* e.g. "Balanced: expected to grow 3.7% a year, can rise or fall about 11.5% in a year" */
    describe() {
      return `${this.name}: expected to grow ${this.expectedReturnPercent} a year, can rise or fall about ${this.volatilityPercent} in a year`;
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = InvestmentPortfolio;
  else global.InvestmentPortfolio = InvestmentPortfolio;
})(typeof window !== "undefined" ? window : globalThis);