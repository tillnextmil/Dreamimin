/* ============================================================
   Plan API client: the only part of the page that talks to the
   server about plans (SPECIFICATIONS.md, item 12). The odds
   controller saves each plan the planner finishes; views never
   call it. Returns promises and throws an ApiError for any
   failed request. When the page is opened straight from disk
   there is no server, so plans aren't saved.
   ============================================================ */

(function (global) {
  "use strict";

  const { sendJson } = (global.Dreamimin && global.Dreamimin.ApiRequest) || require("./request");

  class HttpPlanApi {
    /* fetch is passed in so tests can replace it; base is where the API lives */
    constructor({ fetch = (...args) => global.fetch(...args), base = "/api" } = {}) {
      this.fetch = fetch;
      this.base = base;
    }

    /* plan: the body POST /api/plans takes, as MultiGoalPlan.toJSON() gives it; resolves to the saved plan */
    save(plan) {
      return sendJson(this.fetch, this.base + "/plans", "POST", plan);
    }
  }

  const PlanApi = { HttpPlanApi };
  if (typeof module !== "undefined" && module.exports) module.exports = PlanApi;
  else (global.Dreamimin = global.Dreamimin || {}).PlanApi = PlanApi;
})(typeof window !== "undefined" ? window : globalThis);
