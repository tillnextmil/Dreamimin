/* ============================================================
   RiskPreference — how much investment risk the user accepts
   and whether they want values-based (ESG) investing. The plan
   only uses portfolios up to maxRiskLevel (1 = lowest risk,
   5 = all five). With esg on, it uses the ESG version of each
   portfolio: funds screened for environmental, social and
   governance standards, with the same expected return and
   volatility (SPECIFICATIONS.md, item 17).
   ============================================================ */

(function (global) {
  "use strict";

  const InvestmentPortfolio = global.InvestmentPortfolio || require("./investmentPortfolio");

  class RiskPreference {
    static MIN_RISK_LEVEL = 1;
    static MAX_RISK_LEVEL = 5;

    /* maxRiskLevel starts at 5 and esg at false, as in the MVP */
    constructor({ maxRiskLevel = RiskPreference.MAX_RISK_LEVEL, esg = false } = {}) {
      const errors = RiskPreference.validate({ maxRiskLevel, esg });
      const fields = Object.keys(errors);
      if (fields.length) throw new RangeError(errors[fields[0]]);
      this.maxRiskLevel = maxRiskLevel;
      this.esg = esg;
      Object.freeze(this);
    }

    /* error message per invalid field; empty when everything is valid */
    static validate({ maxRiskLevel, esg }) {
      const errors = {};
      if (!Number.isInteger(maxRiskLevel) || maxRiskLevel < RiskPreference.MIN_RISK_LEVEL || maxRiskLevel > RiskPreference.MAX_RISK_LEVEL) {
        errors.maxRiskLevel = `Choose a risk level from ${RiskPreference.MIN_RISK_LEVEL} to ${RiskPreference.MAX_RISK_LEVEL}.`;
      }
      if (typeof esg !== "boolean") errors.esg = "Choose whether to invest in ESG funds.";
      return errors;
    }

    /* true when the plan may use a portfolio with this risk level */
    allows(riskLevel) {
      return Number.isInteger(riskLevel) && riskLevel >= RiskPreference.MIN_RISK_LEVEL && riskLevel <= this.maxRiskLevel;
    }

    /* the portfolios the plan may use, lowest risk first: { riskLevel, name, expectedReturn, volatility },
       named "ESG Balanced" and so on when esg is on */
    portfolios() {
      return InvestmentPortfolio.all()
        .filter((portfolio) => this.allows(portfolio.riskLevel))
        .map(({ riskLevel, name, expectedReturn, volatility }) =>
          ({ riskLevel, name: this.esg ? `ESG ${name}` : name, expectedReturn, volatility }));
    }

    /* e.g. "Up to Balanced (level 3), ESG funds only" */
    describe() {
      const top = InvestmentPortfolio.fromRiskLevel(this.maxRiskLevel).name;
      return `Up to ${top} (level ${this.maxRiskLevel})${this.esg ? ", ESG funds only" : ""}`;
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = RiskPreference;
  else global.RiskPreference = RiskPreference;
})(typeof window !== "undefined" ? window : globalThis);