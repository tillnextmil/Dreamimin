/* ============================================================
   Risk API client: the only part of the page that talks to the
   server about the risk preference, the highest risk level the
   plan may use and the ESG choice (SPECIFICATIONS.md, item 12).
   The odds controller calls it; views never do. Returns
   promises and throws an ApiError for any failed request. When
   the page is opened straight from disk there is no server, so
   the choice stays in memory.
   ============================================================ */

(function (global) {
  "use strict";

  const { sendJson } = (global.Dreamimin && global.Dreamimin.ApiRequest) || require("./request");

  class HttpRiskApi {
    /* fetch is passed in so tests can replace it; base is where the API lives */
    constructor({ fetch = (...args) => global.fetch(...args), base = "/api" } = {}) {
      this.fetch = fetch;
      this.base = base;
    }

    /* { maxRiskLevel, esg }: level 5 without ESG until the user chooses */
    get() { return sendJson(this.fetch, this.base + "/risk-preference", "GET"); }
    save({ maxRiskLevel, esg }) { return sendJson(this.fetch, this.base + "/risk-preference", "PUT", { maxRiskLevel, esg }); }
  }

  const RiskApi = { HttpRiskApi };
  if (typeof module !== "undefined" && module.exports) module.exports = RiskApi;
  else (global.Dreamimin = global.Dreamimin || {}).RiskApi = RiskApi;
})(typeof window !== "undefined" ? window : globalThis);