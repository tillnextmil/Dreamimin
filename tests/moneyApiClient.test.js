// Unit tests for the page's money API client (client/api/moneyApi.js): HttpMoneyApi sends the
// contract's requests for the profile, funds and spending (SPECIFICATIONS.md, item 12) and turns
// error responses into ApiErrors.
// Author: Autiana Wallace

const { HttpMoneyApi } = require("../client/api/moneyApi");
const { ApiError } = require("../client/api/request");

// a stand-in for fetch: records each request and answers with the given status and body
function fakeFetch(status = 200, body = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { fetch, calls };
}

// the error a promise rejects with, so its status and messages can be checked
const failure = (promise) => promise.then(() => { throw new Error("expected the request to fail"); }, (error) => error);

// normal case: each method sends the contract's method, path and body
test("sends the contract's requests", async () => {
  const { fetch, calls } = fakeFetch(200, { ok: true });
  const api = new HttpMoneyApi({ fetch });
  await api.getProfile();
  await api.saveProfile({ income: 4800, expenses: 3500, netWorth: 12000, emergencyFund: 4000, extra: "ignored" });
  await api.getFunds();
  await api.saveFunds(2000);
  await api.listExpenses();
  await api.addExpense({ amount: 86, date: "2026-11-24", note: "Dinner", category: "food", id: "ignored" });
  await api.removeExpense(7);
  expect(calls).toEqual([
    { url: "/api/profile", method: "GET", body: undefined },
    { url: "/api/profile", method: "PUT", body: { income: 4800, expenses: 3500, netWorth: 12000, emergencyFund: 4000 } },
    { url: "/api/funds", method: "GET", body: undefined },
    { url: "/api/funds", method: "PUT", body: { entered: 2000 } },
    { url: "/api/expenses", method: "GET", body: undefined },
    { url: "/api/expenses", method: "POST", body: { amount: 86, date: "2026-11-24", note: "Dinner", category: "food" } },
    { url: "/api/expenses/7", method: "DELETE", body: undefined },
  ]);
});

// normal case: Start over's requests, and 204 answers resolve to null
test("resets the profile and clears the funds", async () => {
  const { fetch, calls } = fakeFetch(204);
  const api = new HttpMoneyApi({ fetch });
  expect(await api.resetProfile()).toBeNull();
  expect(await api.clearFunds()).toBeNull();
  expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /api/profile", "DELETE /api/funds"]);
});

// normal case: a successful answer is passed back as it came
test("resolves to the server's answer", async () => {
  const funds = { entered: 2000, balance: 1914, totalSpent: 86, totalIncome: 0, totalLoss: 0 };
  const api = new HttpMoneyApi({ fetch: fakeFetch(200, funds).fetch });
  expect(await api.getFunds()).toEqual(funds);
});

// wrong case: a 409 becomes an ApiError with the server's message
test("a 409 becomes an ApiError with the server's message", async () => {
  const api = new HttpMoneyApi({ fetch: fakeFetch(409, { error: "That's more than your available funds." }).fetch });
  const error = await failure(api.addExpense({ amount: 5000, date: "2026-11-24" }));
  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(409);
  expect(error.message).toBe("That's more than your available funds.");
});

// wrong case: a 400 keeps the message for each field
test("a 400 keeps a message per field", async () => {
  const api = new HttpMoneyApi({ fetch: fakeFetch(400, { errors: { income: "Monthly income can't be negative." } }).fetch });
  const error = await failure(api.saveProfile({ income: -1, expenses: 0 }));
  expect(error.status).toBe(400);
  expect(error.errors).toEqual({ income: "Monthly income can't be negative." });
});

// wrong case: a server that can't be reached is status 0 with a message the page can show
test("a server that can't be reached is status 0", async () => {
  const api = new HttpMoneyApi({ fetch: async () => { throw new Error("offline"); } });
  const error = await failure(api.getProfile());
  expect(error.status).toBe(0);
  expect(error.message).toBe("Couldn't reach the server. Check that it's running and try again.");
});