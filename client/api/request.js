/* ============================================================
   What the page's API clients share: sending one JSON request
   to the server and turning a failed one into an ApiError with
   the contract's status and messages (SPECIFICATIONS.md,
   item 12). Only the files in client/api/ use it.
   ============================================================ */

(function (global) {
  "use strict";

  /* a request that failed: the HTTP status, and either one message or a message per field */
  class ApiError extends Error {
    constructor(status, { error, errors } = {}) {
      super(error || (errors && Object.values(errors)[0]) || `The request failed (${status}).`);
      this.name = "ApiError";
      this.status = status;
      this.errors = errors || null;
    }
  }

  /* Sends `body` (if any) as JSON and resolves to the JSON answer, or null for 204. A failed
     request rejects with an ApiError; status 0 means the server couldn't be reached. */
  async function sendJson(fetch, url, method, body) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, { error: "Couldn't reach the server. Check that it's running and try again." });
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, data);
    return data;
  }

  const ApiRequest = { ApiError, sendJson };
  if (typeof module !== "undefined" && module.exports) module.exports = ApiRequest;
  else (global.Dreamimin = global.Dreamimin || {}).ApiRequest = ApiRequest;
})(typeof window !== "undefined" ? window : globalThis);
