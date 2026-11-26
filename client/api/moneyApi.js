/* ============================================================
   Money API client: the only part of the page that talks to the
   server about step 1 — the profile, the available funds and
   the recorded spending (SPECIFICATIONS.md, item 12). The money
   controller calls it; views never do. Returns promises and
   throws an ApiError for any failed request. When the page is
   opened straight from disk there is no server, so the
   controller keeps step 1 in memory instead.
   ============================================================ */

(function (global) {
  "use strict";

  const { sendJson } = (global.Dreamimin && global.Dreamimin.ApiRequest) || require("./request");

  class HttpMoneyApi {
    /* fetch is passed in so tests can replace it; base is where the API lives */
    constructor({ fetch = (...args) => global.fetch(...args), base = "/api" } = {}) {
      this.fetch = fetch;
      this.base = base;
    }

    /* { income, expenses, netWorth, emergencyFund }; income and expenses are null until first saved */
    getProfile() { return this.#send("GET", "/profile"); }
    saveProfile({ income, expenses, netWorth, emergencyFund }) {
      return this.#send("PUT", "/profile", { income, expenses, netWorth, emergencyFund });
    }
    resetProfile() { return this.#send("DELETE", "/profile"); }

    /* { entered, balance, totalSpent, totalIncome, totalLoss }; entered and balance are null until first saved */
    getFunds() { return this.#send("GET", "/funds"); }
    saveFunds(entered) { return this.#send("PUT", "/funds", { entered }); }
    clearFunds() { return this.#send("DELETE", "/funds"); }

    /* the recorded spending, oldest first: [{ id, amount, date, note, category }] */
    listExpenses() { return this.#send("GET", "/expenses"); }
    addExpense({ amount, date, note, category }) {
      return this.#send("POST", "/expenses", { amount, date, note, category });
    }
    
    updateExpense(id, { amount, date, note, category }) {
      return this.#send("PUT", `/expenses/${encodeURIComponent(id)}`, { amount, date, note, category });
    }
    removeExpense(id) { return this.#send("DELETE", `/expenses/${encodeURIComponent(id)}`); }

    #send(method, path, body) {
      return sendJson(this.fetch, this.base + path, method, body);
    }
  }

  const MoneyApi = { HttpMoneyApi };
  if (typeof module !== "undefined" && module.exports) module.exports = MoneyApi;
  else (global.Dreamimin = global.Dreamimin || {}).MoneyApi = MoneyApi;
})(typeof window !== "undefined" ? window : globalThis);