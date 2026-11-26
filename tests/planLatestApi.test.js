// API tests for GET /api/plans/latest through every layer (route, service, repository, SQLite),
// checking the status codes and bodies of the contract (SPECIFICATIONS.md, item 12).
// Author: Autiana Wallace

const request = require("supertest");
const { openDatabase } = require("../server/db");
const { createApp } = require("../server/app");

let db, app, trip;
beforeEach(async () => {
  db = openDatabase(":memory:");
  app = createApp({ db });
  trip = (await request(app).post("/api/goals").send({ name: "Trip", targetAmount: 3000, targetDate: "2099-09-01" })).body;
});

afterEach(() => {
  db.close();
});

const plan = (utility) => ({
  maxRiskLevel: 5, utility, dpUtility: 3, rlEfficiency: 0.9, riskLevelByYear: [5, 4],
  goals: [{ goalId: trip.id, pFull: 0.7, pPartial: 0 }],
});

// wrong case: before any plan is saved, GET is a 404 with the contract's message
test("GET /api/plans/latest is a 404 before the first plan", async () => {
  const res = await request(app).get("/api/plans/latest");
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: "No plan has been saved yet." });
});

// normal case: GET returns the plan saved most recently, as POST returned it
test("GET /api/plans/latest returns the newest plan", async () => {
  await request(app).post("/api/plans").send(plan(1));
  const newest = await request(app).post("/api/plans").send(plan(2));
  const res = await request(app).get("/api/plans/latest");
  expect(res.status).toBe(200);
  expect(res.body).toEqual(newest.body);
});