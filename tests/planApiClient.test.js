// Unit tests for the page's plan API client (client/api/planApi.js) and the request helper the
// API clients share (client/api/request.js): the request POST /api/plans gets, and how answers
// and failures come back (SPECIFICATIONS.md, item 12).
// Author: Aiyan Tong

const { HttpPlanApi } = require("../client/api/planApi");
const { ApiError, sendJson } = require("../client/api/request");

const PLAN = {
  maxRiskLevel: 5, utility: 7.6, dpUtility: 7.7, rlEfficiency: 0.987, riskLevelByYear: [4, 3],
  goals: [{ goalId: 1, pFull: 0.62, pPartial: 0.21 }],
};

/* a fetch stand-in that records each call and answers with `status` and `body` */
function fakeFetch(status, body) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { fetch, calls };
}

// the error a promise rejects with, so its status and messages can be checked
const failure = (promise) => promise.then(() => { throw new Error("expected the request to fail"); }, (error) => error);

// normal case: save POSTs the plan as JSON and resolves to the saved plan
test("save posts the plan to /api/plans", async () => {
  const saved = { id: 7, createdAt: "2026-11-24T10:00:00.000Z", ...PLAN };
  const { fetch, calls } = fakeFetch(201, saved);
  expect(await new HttpPlanApi({ fetch }).save(PLAN)).toEqual(saved);
  expect(calls).toEqual([{
    url: "/api/plans",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(PLAN),
  }]);
});

// wrong case: a 400 comes back as an ApiError with a message per field
test("save rejects with the server's messages on a 400", async () => {
  const errors = { goals: "A plan needs at least one goal." };
  const { fetch } = fakeFetch(400, { errors });
  const error = await failure(new HttpPlanApi({ fetch }).save({ ...PLAN, goals: [] }));
  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(400);
  expect(error.errors).toEqual(errors);
  expect(error.message).toBe("A plan needs at least one goal.");
});

// wrong case: a 404 for a goal that was deleted in the meantime
test("save rejects with the message of a 404", async () => {
  const { fetch } = fakeFetch(404, { error: "No goal with that id." });
  const error = await failure(new HttpPlanApi({ fetch }).save(PLAN));
  expect([error.status, error.message, error.errors]).toEqual([404, "No goal with that id.", null]);
});

// wrong case: no server to reach is status 0 with a message the page can show
test("sendJson rejects with status 0 when the server can't be reached", async () => {
  const fetch = async () => { throw new TypeError("Failed to fetch"); };
  const error = await failure(sendJson(fetch, "/api/plans", "POST", PLAN));
  expect(error.status).toBe(0);
  expect(error.message).toBe("Couldn't reach the server. Check that it's running and try again.");
});

// edge case: 204 has no body, and a request without a body sends no JSON header
test("sendJson resolves to null for 204 and sends nothing extra without a body", async () => {
  const { fetch, calls } = fakeFetch(204, null);
  expect(await sendJson(fetch, "/api/goals/1", "DELETE")).toBeNull();
  expect(calls[0]).toEqual({ url: "/api/goals/1", method: "DELETE", headers: {}, body: undefined });
});

// edge case: an error answer that isn't JSON still becomes an ApiError with a general message
test("sendJson gives a general message when the error has no JSON body", async () => {
  const fetch = async () => ({ status: 500, ok: false, json: async () => { throw new SyntaxError("not JSON"); } });
  const error = await failure(sendJson(fetch, "/api/plans", "POST", PLAN));
  expect([error.status, error.message]).toEqual([500, "The request failed (500)."]);
});
