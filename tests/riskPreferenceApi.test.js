// API tests for GET and PUT /api/risk-preference through every layer (route, service,
// repository, SQLite), checking the status codes and bodies of the contract (SPECIFICATIONS.md, item 12).
// Author: Autiana Wallace

const request = require("supertest");
const { openDatabase } = require("../server/db");
const { createApp } = require("../server/app");

let db, app;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp({ db });
});

afterEach(() => {
  db.close();
});

// normal case: GET gives the starting preference; PUT saves a new one and GET reads it back
test("GET and PUT /api/risk-preference", async () => {
  expect((await request(app).get("/api/risk-preference")).body).toEqual({ maxRiskLevel: 5, esg: false });
  const saved = await request(app).put("/api/risk-preference").send({ maxRiskLevel: 2, esg: true });
  expect(saved.status).toBe(200);
  expect(saved.body).toEqual({ maxRiskLevel: 2, esg: true });
  expect((await request(app).get("/api/risk-preference")).body).toEqual({ maxRiskLevel: 2, esg: true });
});

// wrong case: an invalid level is a 400 with the contract's message
test("an invalid level is a 400", async () => {
  const res = await request(app).put("/api/risk-preference").send({ maxRiskLevel: 9 });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ errors: { maxRiskLevel: "Choose a risk level from 1 to 5." } });
});