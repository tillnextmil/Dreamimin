/* ============================================================
   FinancialProfile — a person's financial picture.
   Stores monthly income, monthly expenses, net worth and the
   emergency fund the person wants to keep, and works out what is
   left each month, the share of income saved and how much money
   the goals can start from.
   ============================================================ */

(function (global) {
  "use strict";

  let nextId = 1;

  class FinancialProfile {
    /* income and expenses are per month; net worth can be negative (more owed than owned);
       emergencyFund is money the person keeps for surprises and never puts toward goals */
    constructor({ id, name = "My profile", income, expenses, netWorth = 0, emergencyFund = 0 }) {
      const errors = FinancialProfile.validate({ income, expenses, netWorth, emergencyFund });
      const fields = Object.keys(errors);
      if (fields.length) throw new RangeError(errors[fields[0]]);
      this.id = id ?? "profile-" + nextId++;
      this.name = name;
      this.income = income;
      this.expenses = expenses;
      this.netWorth = netWorth;
      this.emergencyFund = emergencyFund;
    }

    /* error message per invalid field; empty when everything is valid */
    static validate({ income, expenses, netWorth, emergencyFund = 0 }) {
      const errors = {};
      const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
      if (!isNumber(income)) errors.income = "Monthly income must be a number.";
      else if (income < 0) errors.income = "Monthly income can't be negative.";
      if (!isNumber(expenses)) errors.expenses = "Monthly spending must be a number.";
      else if (expenses < 0) errors.expenses = "Monthly spending can't be negative.";
      if (!isNumber(netWorth)) errors.netWorth = "Net worth must be a number.";
      if (!isNumber(emergencyFund)) errors.emergencyFund = "Emergency fund must be a number.";
      else if (emergencyFund < 0) errors.emergencyFund = "Emergency fund can't be negative.";
      return errors;
    }

    /* money left over each month; negative when spending more than earning */
    get monthlyCashFlow() {
      return this.income - this.expenses;
    }

    /* share of income left over each month, e.g. 0.2 for 20%; 0 when there is no income */
    get savingsRate() {
      return this.income > 0 ? this.monthlyCashFlow / this.income : 0;
    }

    /* The money the goals start from: the available funds left when the person entered them
       (a number, or null when they didn't), otherwise the net worth, minus the emergency fund,
       and never below 0. Step 2's goal check and step 3's chances both use it. */
    moneyForGoals(availableFunds = null) {
      if (availableFunds !== null && (typeof availableFunds !== "number" || !Number.isFinite(availableFunds))) {
        throw new TypeError("Available funds must be a number.");
      }
      const start = availableFunds === null ? this.netWorth : availableFunds;
      return Math.max(0, start - this.emergencyFund);
    }

    updateIncome(income) {
      this.#apply({ income });
    }

    updateExpenses(expenses) {
      this.#apply({ expenses });
    }

    updateNetWorth(netWorth) {
      this.#apply({ netWorth });
    }

    updateEmergencyFund(emergencyFund) {
      this.#apply({ emergencyFund });
    }

    /* change only valid values, so a bad update leaves the profile as it was */
    #apply(changes) {
      const next = { income: this.income, expenses: this.expenses, netWorth: this.netWorth, emergencyFund: this.emergencyFund, ...changes };
      const errors = FinancialProfile.validate(next);
      const field = Object.keys(changes)[0];
      if (errors[field]) throw new RangeError(errors[field]);
      this[field] = changes[field];
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = FinancialProfile;
  else global.FinancialProfile = FinancialProfile;
})(typeof window !== "undefined" ? window : globalThis);
