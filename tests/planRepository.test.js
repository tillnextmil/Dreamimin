// Unit tests for PlanRepository (server/repositories/planRepository.js): the SQL that saves a plan
// across plan_result, goal_result and plan_year, and reads it back in the API's shape.
// Author: Aiyan Tong

const { openDatabase, PROFILE_ID } = require("../server/db");
const GoalRepository = require("../server/repositories/goalRepository");
const PlanRepository = require("../server/repositories/planRepository");

const TRIP = { name: "Trip", targetAmount: 3000, targetDate: "2099-09-01", priority: 3, minAcceptableAmount: 0 };
const HOUSE = { name: "House", targetAmount: 60000, targetDate: "2098-06-01", priority: 5, minAcceptableAmount: 45000 };

let db, plans, goals, trip, house;
beforeEach(() => {
  db = openDatabase(":memory:");
  plans = new PlanRepository(db);
  goals = new GoalRepository(db);
  trip = goals.create(PROFILE_ID, TRIP);
  house = goals.create(PROFILE_ID, HOUSE);
});

afterEach(() => {
  db.close();
});

const planFor = (changes = {}) => ({
  maxRiskLevel: 4,
  utility: 7.6,
  dpUtility: 7.7,
  rlEfficiency: 0.987,
  riskLevelByYear: [4, 4, 3, 1],
  goals: [
    { goalId: trip.id, pFull: 1, pPartial: 0, verdict: "Realistic" },
    { goalId: house.id, pFull: 0.25, pPartial: 0.4, verdict: "Within reach" },
  ],
  ...changes,
});
const rows = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

// normal case: one plan_result row, a goal_result row per goal and a plan_year row per year
test("create saves the plan, its goals and its years", () => {
  const saved = plans.create(PROFILE_ID, planFor());
  expect(saved).toEqual({
    id: expect.any(Number),
    createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    maxRiskLevel: 4,
    utility: 7.6,
    dpUtility: 7.7,
    rlEfficiency: 0.987,
    riskLevelByYear: [4, 4, 3, 1],
    goals: [
      { goalId: house.id, pFull: 0.25, pPartial: 0.4, pAny: 0.65, verdict: "Within reach" },   // soonest date first
      { goalId: trip.id, pFull: 1, pPartial: 0, pAny: 1, verdict: "Realistic" },
    ],
  });
  expect([rows("plan_result"), rows("goal_result"), rows("plan_year")]).toEqual([1, 2, 4]);
  expect(plans.count(PROFILE_ID)).toBe(1);
});

// normal case: each year points at the portfolio with that risk level, all of the money in it
test("stores each year's portfolio by its risk level", () => {
  const saved = plans.create(PROFILE_ID, planFor());
  const years = db.prepare(`
    SELECT y.year, p.name, y.allocation_percent FROM plan_year y JOIN investment_portfolio p USING (portfolio_id)
    WHERE y.plan_id = ? ORDER BY y.year
  `).all(saved.id);
  expect(years.map((y) => ({ ...y }))).toEqual([
    { year: 1, name: "Growth", allocation_percent: 1 },
    { year: 2, name: "Growth", allocation_percent: 1 },
    { year: 3, name: "Balanced", allocation_percent: 1 },
    { year: 4, name: "Cautious", allocation_percent: 1 },
  ]);
});

// edge case: no RL efficiency when the benchmark can't reach any goal
test("keeps an empty RL efficiency", () => {
  expect(plans.create(PROFILE_ID, planFor({ rlEfficiency: null })).rlEfficiency).toBeNull();
});

// edge case: a saved plan is a record; editing a goal later doesn't change it, deleting one drops its result
test("keeps the plan when a goal changes and drops a deleted goal's result", () => {
  const saved = plans.create(PROFILE_ID, planFor());
  goals.update(PROFILE_ID, trip.id, { ...TRIP, targetAmount: 3800 });
  expect(plans.findById(PROFILE_ID, saved.id)).toEqual(saved);

  goals.remove(PROFILE_ID, house.id);
  expect(plans.findById(PROFILE_ID, saved.id).goals.map((g) => g.goalId)).toEqual([trip.id]);
  expect(rows("goal_result")).toBe(1);
});

// wrong case: a goal that isn't in the goal table fails the whole save, leaving nothing behind
test("saves nothing when one goal result can't be saved", () => {
  const plan = planFor({ goals: [...planFor().goals, { goalId: 999, pFull: 0.5, pPartial: 0, verdict: "Within reach" }] });
  expect(() => plans.create(PROFILE_ID, plan)).toThrow();
  expect([rows("plan_result"), rows("goal_result"), rows("plan_year")]).toEqual([0, 0, 0]);
});

// wrong case: a year at a risk level no portfolio has fails the whole save too
test("saves nothing when a year has no portfolio", () => {
  expect(() => plans.create(PROFILE_ID, planFor({ riskLevelByYear: [4, 9] }))).toThrow("No portfolio at risk level 9.");
  expect([rows("plan_result"), rows("goal_result"), rows("plan_year")]).toEqual([0, 0, 0]);
});

// edge case: an id with no plan, or another profile's plan, reads as null
test("findById returns null for an unknown plan", () => {
  const saved = plans.create(PROFILE_ID, planFor());
  expect(plans.findById(PROFILE_ID, saved.id + 1)).toBeNull();
  expect(plans.findById(PROFILE_ID + 1, saved.id)).toBeNull();
});
