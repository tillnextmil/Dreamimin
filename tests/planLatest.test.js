// Unit tests for reading back the latest saved plan: the SQL (PlanRepository.findLatest)
// and the rule (PlanService.getLatestPlan, a 404 before the first plan).
// Author: Autiana Wallace

const { openDatabase, PROFILE_ID } = require("../server/db");
const GoalRepository = require("../server/repositories/goalRepository");
const PlanRepository = require("../server/repositories/planRepository");
const PlanService = require("../server/services/planService");
const ServiceError = require("../server/services/serviceError");

const TRIP = { name: "Trip", targetAmount: 3000, targetDate: "2099-09-01", priority: 3, minAcceptableAmount: 0 };

let db, plans, service, trip;
beforeEach(() => {
  db = openDatabase(":memory:");
  const goals = new GoalRepository(db);
  plans = new PlanRepository(db);
  service = new PlanService(plans, goals, { profileId: PROFILE_ID });
  trip = goals.create(PROFILE_ID, TRIP);
});

afterEach(() => {
  db.close();
});

// a plan body the page would send, with the given utility so tests can tell plans apart
const planWith = (utility) => ({
  maxRiskLevel: 4,
  utility,
  dpUtility: 3,
  rlEfficiency: 0.9,
  riskLevelByYear: [4, 3],
  goals: [{ goalId: trip.id, pFull: 0.7, pPartial: 0 }],
});

// edge case: before any plan is saved there is no latest plan (null from SQL, 404 from the service)
test("there is no latest plan before the first is saved", () => {
  expect(plans.findLatest(PROFILE_ID)).toBeNull();
  let error;
  try {
    service.getLatestPlan();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ServiceError);
  expect(error.status).toBe(404);
  expect(error.body).toEqual({ error: "No plan has been saved yet." });
});

// normal case: the latest plan comes back in the same shape POST returned
test("returns the plan that was saved, in the API's shape", () => {
  const saved = service.savePlan(planWith(2.5));
  expect(service.getLatestPlan()).toEqual(saved);
});

// normal case: with several plans, the newest one comes back, even when they share a timestamp
test("returns the newest of several plans", () => {
  service.savePlan(planWith(1));
  service.savePlan(planWith(2));
  const newest = service.savePlan(planWith(3));
  db.prepare("UPDATE plan_result SET created_at = '2026-11-26T12:00:00.000Z'").run();   // same time for all three
  expect(service.getLatestPlan()).toMatchObject({ id: newest.id, utility: 3 });
});

// edge case: a plan saved later wins even if its id is lower
test("orders by when the plan was saved first", () => {
  const first = service.savePlan(planWith(1));
  service.savePlan(planWith(2));
  db.prepare("UPDATE plan_result SET created_at = '2030-01-01T00:00:00.000Z' WHERE plan_id = ?").run(first.id);
  expect(service.getLatestPlan().id).toBe(first.id);
});

// wrong case: another profile's plans are never returned
test("only returns the profile's own plans", () => {
  db.prepare("INSERT INTO profile (profile_id) VALUES (2)").run();
  service.savePlan(planWith(1));
  expect(plans.findLatest(2)).toBeNull();
});