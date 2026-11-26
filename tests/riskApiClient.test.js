// Unit tests for the page's risk API client (client/api/riskApi.js): HttpRiskApi sends the
// contract's requests for the risk preference (SPECIFICATIONS.md, item 12) and turns errors into ApiErrors.
// Author: Autiana Wallace

const { HttpRiskApi } = require("../client/api/riskApi");
const { ApiError } = require("../client/api/request");

function fakeFetch(status = 200, body = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { fetch, calls };
}

// normal case: GET and PUT /api/risk-preference, sending only the contract's fields
test("gets and saves the risk preference", async () => {
  const { fetch, calls } = fakeFetch(200, { maxRiskLevel: 3, esg: true });
  const api = new HttpRiskApi({ fetch });
  expect(await api.get()).toEqual({ maxRiskLevel: 3, esg: true });
  await api.save({ maxRiskLevel: 3, esg: true, extra: "ignored" });
  expect(calls).toEqual([
    { url: "/api/risk-preference", method: "GET", body: undefined },
    { url: "/api/risk-preference", method: "PUT", body: { maxRiskLevel: 3, esg: true } },
  ]);
});

// wrong case: a 400 becomes an ApiError with the message per field
test("a 400 becomes an ApiError", async () => {
  const api = new HttpRiskApi({ fetch: fakeFetch(400, { errors: { maxRiskLevel: "Choose a risk level from 1 to 5." } }).fetch });
  const error = await api.save({ maxRiskLevel: 9 }).catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.errors).toEqual({ maxRiskLevel: "Choose a risk level from 1 to 5." });
});