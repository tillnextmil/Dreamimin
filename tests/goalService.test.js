// Unit tests for GoalService (server/services/goalService.js): validating goals with
// FinancialGoal, the 20-goal limit, sort and search with GoalList, and unknown ids.
// Author: Autiana Wallace

const { openDatabase, PROFILE_ID } = require("../server/db");
const GoalRepository = require("../server/repositories/goalRepository");
const GoalService = require("../server/services/goalService");
const ServiceError = require("../server/services/serviceError");

// Fixed "today" so results never depend on when the tests run.
const TODAY = new Date(2026, 10, 16);
const CAR = { name: "Car", targetAmount: 12000, targetDate: "2028-06-01", priority: 4, minAcceptableAmount: 8000 };

let db, service;
beforeEach(() => {
  db = openDatabase(":memory:");
  service = new GoalService(new GoalRepository(db), { profileId: PROFILE_ID, now: () => TODAY });
});

afterEach(() => {
  db.close();
});

// the ServiceError a call throws, so tests can check its status and body
function errorFrom(call) {
  try {
    call();
  } catch (error) {
    if (error instanceof ServiceError) return error;
    throw error;
  }
  throw new Error("expected a ServiceError");
}

// ---------- Creating ----------

// normal case: a valid goal is saved and returned
test("creates a valid goal", () => {
  const goal = service.createGoal(CAR);
  expect(goal).toEqual({ id: expect.any(Number), ...CAR, createdAt: expect.any(String) });
  expect(service.getGoal(goal.id)).toEqual(goal);
});

// edge case: priority and the smallest amount get their defaults, the name is trimmed,
// and fields that aren't part of a goal are ignored
test("fills in defaults, trims the name and ignores unknown fields", () => {
  const goal = service.createGoal({ name: "  Trip  ", targetAmount: 2500, targetDate: "2027-03-15", color: "red" });
  expect(goal).toMatchObject({ name: "Trip", priority: 3, minAcceptableAmount: 0 });
  expect(goal).not.toHaveProperty("color");
});

// wrong case: an invalid goal is a 400 with FinancialGoal's message for each invalid field
test("rejects an invalid goal with a message per field", () => {
  const error = errorFrom(() => service.createGoal({ name: "", targetAmount: -5, targetDate: "2026-11-16", priority: 9 }));
  expect(error.status).toBe(400);
  expect(error.body).toEqual({
    errors: {
      name: "Give your goal a name.",
      targetAmount: "Goal amount must be more than $0.",
      targetDate: "Target date must be after today.",
      priority: "Choose a priority from 1 to 5.",
    },
  });
  expect(service.listGoals()).toEqual([]);
});

// wrong case: a missing name, or no body at all, is rejected instead of becoming "My goal"
test.each([{ targetAmount: 100, targetDate: "2027-01-01" }, undefined, null, "Car", []])(
  "rejects %p because it has no name",
  (body) => {
    expect(errorFrom(() => service.createGoal(body)).body.errors.name).toBe("Give your goal a name.");
  }
);

// wrong case: the smallest amount must be less than the goal amount
test("rejects a smallest amount that isn't less than the goal amount", () => {
  const error = errorFrom(() => service.createGoal({ ...CAR, minAcceptableAmount: 12000 }));
  expect(error.body.errors).toEqual({
    minAcceptableAmount: "The smallest amount you'd accept must be $0 or more and less than the goal amount.",
  });
});

// edge case: 20 goals are allowed, a 21st is a 409 and isn't saved
test("allows 20 goals and rejects a 21st", () => {
  for (let i = 1; i <= 20; i++) service.createGoal({ ...CAR, name: `Goal ${i}` });
  const error = errorFrom(() => service.createGoal({ ...CAR, name: "Goal 21" }));
  expect(error.status).toBe(409);
  expect(error.body).toEqual({ error: "You can have up to 20 goals." });
  expect(service.listGoals()).toHaveLength(20);
});

// ---------- Listing ----------

// normal case: sort and search use GoalList's rules
test("sorts and searches the goals", () => {
  service.createGoal({ ...CAR, name: "Car", priority: 2 });
  service.createGoal({ name: "Trip", targetAmount: 2500, targetDate: "2027-03-15", priority: 5 });
  service.createGoal({ name: "Car repair", targetAmount: 800, targetDate: "2029-01-01", priority: 3 });

  expect(service.listGoals().map((g) => g.name)).toEqual(["Trip", "Car", "Car repair"]);
  expect(service.listGoals({ sort: "priority" }).map((g) => g.name)).toEqual(["Trip", "Car repair", "Car"]);
  expect(service.listGoals({ sort: "amount" }).map((g) => g.name)).toEqual(["Car", "Trip", "Car repair"]);
  expect(service.listGoals({ sort: "name" }).map((g) => g.name)).toEqual(["Car", "Car repair", "Trip"]);
  expect(service.listGoals({ search: "  CAR " }).map((g) => g.name)).toEqual(["Car", "Car repair"]);
  expect(service.listGoals({ search: "house" })).toEqual([]);
});

// wrong case: a sort that isn't on the list is a 400
test("rejects an unknown sort", () => {
  const error = errorFrom(() => service.listGoals({ sort: "color" }));
  expect(error.status).toBe(400);
  expect(error.body).toEqual({ errors: { sort: "Sort by date, priority, amount or name." } });
});

// ---------- Editing and deleting ----------

// normal case: editing to a later date extends the goal and keeps its id and createdAt
test("extending a goal's date keeps its id", () => {
  const goal = service.createGoal(CAR);
  const extended = service.updateGoal(String(goal.id), { ...CAR, targetDate: "2030-06-01" });
  expect(extended).toEqual({ ...goal, targetDate: "2030-06-01" });
});

// wrong case: an invalid edit is a 400 and leaves the goal as it was
test("an invalid edit changes nothing", () => {
  const goal = service.createGoal(CAR);
  expect(errorFrom(() => service.updateGoal(goal.id, { ...CAR, targetAmount: 0 })).status).toBe(400);
  expect(service.getGoal(goal.id)).toEqual(goal);
});

// normal case: a deleted goal is gone
test("deletes a goal", () => {
  const goal = service.createGoal(CAR);
  service.deleteGoal(goal.id);
  expect(service.listGoals()).toEqual([]);
});

// wrong case: an unknown id, or one that isn't a whole number, is a 404 for get, edit and delete
test.each(["99", "abc", "1.5", "0", "-1", ""])("treats the id %p as unknown", (id) => {
  service.createGoal(CAR);
  for (const call of [() => service.getGoal(id), () => service.updateGoal(id, CAR), () => service.deleteGoal(id)]) {
    const error = errorFrom(call);
    expect(error.status).toBe(404);
    expect(error.body).toEqual({ error: "No goal with that id." });
  }
  expect(service.listGoals()).toHaveLength(1);
});