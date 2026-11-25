// API tests for POST /api/plans through every layer (route, service, repository, SQLite):
// saving a plan the page worked out, and the 400 and 404 answers of the contract
// (SPECIFICATIONS.md, item 12).
// Author: Aiyan Tong

const request = require("supertest");
const { openDatabase } = require("../server/db");
const { createApp } = require("../server/app");
const MultiGoalPlan = require("../src/multiGoalPlan");
const MultiGoalPlanner = require("../src/multiGoalPlanner");

// Dates far enough ahead that the goals are valid whenever the tests run.
const TRIP = { name: "Trip", targetAmount: 3000, targetDate: "2099-09-01" };
const HOUSE = { name: "House", targetAmount: 60000, targetDate: "2098-06-01", priority: 5, minAcceptableAmount: 45000 };

let db, app, trip, house;
beforeEach(async () => {
  db = openDatabase(":memory:");
  app = createApp({ db });
  trip = (await request(app).post("/api/goals").send(TRIP)).body;
  house = (await request(app).post("/api/goals").send(HOUSE)).body;
});

afterEach(() => {
  db.close();
});

const body = (changes = {}) => ({
  maxRiskLevel: 5,
  utility: 7.6,
  dpUtility: 7.7,
  rlEfficiency: 0.987,
  riskLevelByYear: [4, 4, 3, 1],
  goals: [
    { goalId: trip.id, pFull: 1, pPartial: 0 },
    { goalId: house.id, pFull: 0.62, pPartial: 0.21 },
  ],
  ...changes,
});
const savedPlans = () => db.prepare("SELECT COUNT(*) AS n FROM plan_result").get().n;
const post = (sent) => request(app).post("/api/plans").send(sent);

// normal case: 201 with the plan, its id and createdAt, and each goal's pAny and verdict
test("POST saves a plan and returns it with each goal's verdict", async () => {
  const res = await post(body());
  expect(res.status).toBe(201);
  expect(res.body).toEqual({
    id: expect.any(Number),
    createdAt: expect.any(String),
    maxRiskLevel: 5,
    utility: 7.6,
    dpUtility: 7.7,
    rlEfficiency: 0.987,
    riskLevelByYear: [4, 4, 3, 1],
    goals: [
      { goalId: house.id, pFull: 0.62, pPartial: 0.21, pAny: 0.83, verdict: "Realistic" },
      { goalId: trip.id, pFull: 1, pPartial: 0, pAny: 1, verdict: "Realistic" },
    ],
  });
  expect(savedPlans()).toBe(1);
});

// normal case: what the page sends, MultiGoalPlan's toJSON() of a real planner result, is accepted
test("accepts the body MultiGoalPlan.toJSON() gives", async () => {
  const result = MultiGoalPlanner.plan({
    netWorth: 15000,
    monthlySaving: 900,
    goals: [
      { id: trip.id, targetAmount: 3000, months: 10 },
      { id: house.id, targetAmount: 60000, months: 44, priority: 5, minAcceptableAmount: 45000 },
    ],
  }, { iterations: 10, evalPaths: 300 });
  const sent = new MultiGoalPlan(result).toJSON();
  const res = await post(sent);
  expect(res.status).toBe(201);
  expect(res.body.riskLevelByYear).toEqual(sent.riskLevelByYear);
  expect(res.body.goals.map((g) => g.goalId).sort()).toEqual([trip.id, house.id].sort());
});

// edge case: no RL efficiency, and fields the contract doesn't have are ignored
test("saves a plan with no RL efficiency and ignores unknown fields", async () => {
  const res = await post({ ...body({ rlEfficiency: null }), portfolios: ["a"], note: "extra" });
  expect(res.status).toBe(201);
  expect(res.body.rlEfficiency).toBeNull();
  expect(res.body).not.toHaveProperty("note");
});

// wrong case: one message per invalid field, the same messages as MultiGoalPlan, and nothing saved
test("rejects invalid fields with a message for each", async () => {
  const res = await post({ maxRiskLevel: 6, utility: -1, dpUtility: "7", rlEfficiency: 1.5, riskLevelByYear: [], goals: [] });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({
    errors: {
      maxRiskLevel: "Choose a risk level from 1 to 5.",
      utility: "Utility must be a number of 0 or more.",
      dpUtility: "Utility must be a number of 0 or more.",
      rlEfficiency: "RL efficiency must be between 0 and 1, or null.",
      riskLevelByYear: "A plan covers 1 to 40 years.",
      goals: "A plan needs at least one goal.",
    },
  });
  expect(savedPlans()).toBe(0);
});

// wrong case: problems inside the goals and the years
test.each([
  ["chances adding up to more than 1", { goals: [{ goalId: 1, pFull: 0.7, pPartial: 0.4 }] }, "goals", "A goal's full and partial chances can't add up to more than 1."],
  ["a chance that isn't a number", { goals: [{ goalId: 1, pFull: "0.5", pPartial: 0 }] }, "goals", "Probability must be a number."],
  ["the same goal twice", { goals: [{ goalId: 1, pFull: 0.5, pPartial: 0 }, { goalId: 1, pFull: 0.5, pPartial: 0 }] }, "goals", "Two goals can't share an id."],
  ["a goal without an id", { goals: [{ pFull: 0.5, pPartial: 0 }] }, "goals", "Every goal needs an id."],
  ["a year above the plan's risk level", { maxRiskLevel: 3, riskLevelByYear: [3, 4] }, "riskLevelByYear", "Each year's risk level must be from 1 up to the plan's risk level."],
  ["41 years", { riskLevelByYear: new Array(41).fill(1) }, "riskLevelByYear", "A plan covers 1 to 40 years."],
  ["RL efficiency left out", { rlEfficiency: undefined }, "rlEfficiency", "RL efficiency must be between 0 and 1, or null."],
])("rejects %s", async (_, changes, field, message) => {
  const res = await post(body(changes));
  expect(res.status).toBe(400);
  expect(res.body.errors).toEqual({ [field]: message });
  expect(savedPlans()).toBe(0);
});

// wrong case: a body that isn't an object at all
test("rejects a body that isn't a plan", async () => {
  const res = await request(app).post("/api/plans").send([1, 2]);
  expect(res.status).toBe(400);
  expect(Object.keys(res.body.errors)).toEqual(["maxRiskLevel", "utility", "dpUtility", "rlEfficiency", "riskLevelByYear", "goals"]);
});

// wrong case: a goal that doesn't exist is a 404 and saves nothing, not even the other goals' results
test.each([
  ["an unknown id", 999],
  ["an id that isn't a whole number", "1"],
])("answers 404 for %s", async (_, goalId) => {
  const res = await post(body({ goals: [{ goalId: trip.id, pFull: 1, pPartial: 0 }, { goalId, pFull: 0.5, pPartial: 0 }] }));
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: "No goal with that id." });
  expect(savedPlans()).toBe(0);
});

// wrong case: a body that isn't valid JSON
test("rejects a body that isn't JSON", async () => {
  const res = await request(app).post("/api/plans").set("Content-Type", "application/json").send("{ not json");
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: "The request body isn't valid JSON." });
});

// edge case: deleting a goal through the API deletes its result from saved plans
test("deleting a goal removes its result from saved plans", async () => {
  const saved = (await post(body())).body;
  await request(app).delete(`/api/goals/${house.id}`).expect(204);
  const left = db.prepare("SELECT goal_id FROM goal_result WHERE plan_id = ?").all(saved.id).map((r) => r.goal_id);
  expect(left).toEqual([trip.id]);
});
