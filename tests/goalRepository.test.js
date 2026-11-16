// Unit tests for GoalRepository (server/repositories/goalRepository.js): the SQL that saves,
// reads, changes and deletes goals in the real goal table.
// Author: Autiana Wallace

const { openDatabase, PROFILE_ID } = require("../server/db");
const GoalRepository = require("../server/repositories/goalRepository");

const CAR = { name: "Car", targetAmount: 12000, targetDate: "2028-06-01", priority: 4, minAcceptableAmount: 8000 };
const TRIP = { name: "Trip", targetAmount: 2500.5, targetDate: "2027-03-15", priority: 3, minAcceptableAmount: 0 };

// A fresh database in memory for each test, made the same way the server makes it.
let db, goals;
beforeEach(() => {
  db = openDatabase(":memory:");
  goals = new GoalRepository(db);
});

afterEach(() => {
  db.close();
});

// normal case: create saves a goal and returns it with an id and createdAt
test("create saves a goal and returns it in the API's shape", () => {
  const saved = goals.create(PROFILE_ID, CAR);
  expect(saved).toEqual({ id: expect.any(Number), ...CAR, createdAt: expect.any(String) });
  expect(goals.count(PROFILE_ID)).toBe(1);
});

// normal case: findById reads back the goal that was saved
test("findById returns the saved goal", () => {
  const saved = goals.create(PROFILE_ID, CAR);
  expect(goals.findById(PROFILE_ID, saved.id)).toEqual(saved);
});

// normal case: findAll lists soonest target date first
test("findAll lists the goals soonest first", () => {
  goals.create(PROFILE_ID, CAR);
  goals.create(PROFILE_ID, TRIP);
  expect(goals.findAll(PROFILE_ID).map((g) => g.name)).toEqual(["Trip", "Car"]);
});

// normal case: update changes every field but keeps the id and createdAt
test("update changes the fields and keeps the id and createdAt", () => {
  const saved = goals.create(PROFILE_ID, CAR);
  const changed = { ...CAR, name: "Used car", targetDate: "2029-01-01", priority: 5 };
  const updated = goals.update(PROFILE_ID, saved.id, changed);
  expect(updated).toEqual({ ...saved, ...changed });
  expect(goals.findById(PROFILE_ID, saved.id)).toEqual(updated);
});

// normal case: remove deletes the goal and only that goal
test("remove deletes one goal", () => {
  const car = goals.create(PROFILE_ID, CAR);
  goals.create(PROFILE_ID, TRIP);
  expect(goals.remove(PROFILE_ID, car.id)).toBe(true);
  expect(goals.findById(PROFILE_ID, car.id)).toBeNull();
  expect(goals.findAll(PROFILE_ID).map((g) => g.name)).toEqual(["Trip"]);
});

// edge case: a new profile has no goals
test("a profile with no goals has an empty list and a count of 0", () => {
  expect(goals.findAll(PROFILE_ID)).toEqual([]);
  expect(goals.count(PROFILE_ID)).toBe(0);
});

// edge case: deleting a goal deletes its saved plan results too (ON DELETE CASCADE)
test("remove deletes the goal's saved results", () => {
  const car = goals.create(PROFILE_ID, CAR);
  const plan = db.prepare(
    "INSERT INTO plan_result (profile_id, max_risk_level, utility, dp_utility) VALUES (?, 5, 1, 1)"
  ).run(PROFILE_ID).lastInsertRowid;
  db.prepare("INSERT INTO goal_result (plan_id, goal_id, p_full, p_partial, verdict) VALUES (?, ?, 0.5, 0.1, 'Within reach')")
    .run(plan, car.id);
  goals.remove(PROFILE_ID, car.id);
  expect(db.prepare("SELECT COUNT(*) AS total FROM goal_result").get().total).toBe(0);
});

// wrong case: an id that doesn't exist finds, changes and deletes nothing
test("an unknown id finds, changes and deletes nothing", () => {
  goals.create(PROFILE_ID, CAR);
  expect(goals.findById(PROFILE_ID, 99)).toBeNull();
  expect(goals.update(PROFILE_ID, 99, TRIP)).toBeNull();
  expect(goals.remove(PROFILE_ID, 99)).toBe(false);
  expect(goals.count(PROFILE_ID)).toBe(1);
});

// wrong case: one profile can't read, change or delete another profile's goal
test("goals belong to one profile", () => {
  db.prepare("INSERT INTO profile (profile_id) VALUES (2)").run();
  const theirs = goals.create(2, CAR);
  expect(goals.findById(PROFILE_ID, theirs.id)).toBeNull();
  expect(goals.update(PROFILE_ID, theirs.id, TRIP)).toBeNull();
  expect(goals.remove(PROFILE_ID, theirs.id)).toBe(false);
  expect(goals.findAll(PROFILE_ID)).toEqual([]);
  expect(goals.findById(2, theirs.id).name).toBe("Car");
});

// wrong case: the table's checks stop an invalid goal even if the service is skipped
test("the table rejects a goal the service would reject", () => {
  expect(() => goals.create(PROFILE_ID, { ...CAR, priority: 6 })).toThrow();
  expect(() => goals.create(PROFILE_ID, { ...CAR, minAcceptableAmount: 12000 })).toThrow();
  expect(goals.count(PROFILE_ID)).toBe(0);
});