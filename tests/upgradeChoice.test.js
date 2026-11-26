// Unit tests for UpgradeChoice (src/upgradeChoice.js): the two choices when extra money comes in,
// raising a goal or taking less risk, as changes to the planner's job.
// Author: Autiana Wallace

const UpgradeChoice = require("../src/upgradeChoice");
const MultiGoalPlanner = require("../src/multiGoalPlanner");

const JOB = {
  netWorth: 12000,
  monthlySaving: 900,
  maxRiskLevel: 4,
  goals: [
    { id: 1, targetAmount: 3000, months: 10, priority: 3, minAcceptableAmount: 0 },
    { id: 2, targetAmount: 40000, months: 60, priority: 5, minAcceptableAmount: 30000 },
  ],
};

// normal case: raising adds the extra money to one goal only; safer is one level lower
test("builds the raise and safer choices", () => {
  const { raise, safer } = UpgradeChoice.options(JOB, { extra: 800, goalId: 2 });
  expect(raise.goalId).toBe(2);
  expect(raise.targetAmount).toBe(40800);
  expect(raise.changes.goals.map((g) => g.targetAmount)).toEqual([3000, 40800]);
  expect(raise.changes.goals[1]).toMatchObject({ months: 60, priority: 5, minAcceptableAmount: 30000 });
  expect(safer).toEqual({ maxRiskLevel: 3, changes: { maxRiskLevel: 3 } });
  expect(JOB.goals[1].targetAmount).toBe(40000);   // the job itself isn't changed
});

// edge case: at the lowest risk level there is no safer choice; no level in the job means 5;
// a goal id given as text still finds the goal; cents add up exactly
test("handles level 1, a missing level, text ids and cents", () => {
  expect(UpgradeChoice.options({ ...JOB, maxRiskLevel: 1 }, { extra: 100, goalId: 1 }).safer).toBeNull();
  const { maxRiskLevel, ...noLevel } = JOB;
  expect(UpgradeChoice.options(noLevel, { extra: 100, goalId: 1 }).safer.maxRiskLevel).toBe(4);
  expect(UpgradeChoice.options(JOB, { extra: 0.1, goalId: "1" }).raise.targetAmount).toBe(3000.1);
});

// wrong case: the extra money must be a number above $0, and the goal must be in the job
test("rejects a bad amount or a goal that isn't planned", () => {
  expect(UpgradeChoice.validate(JOB, { extra: 0, goalId: 1 })).toEqual({ extra: "The extra money must be more than $0." });
  expect(UpgradeChoice.validate(JOB, { extra: null, goalId: 9 })).toEqual({
    extra: "Enter how much extra money came in.", goalId: "Choose a goal to raise.",
  });
  expect(() => UpgradeChoice.options(JOB, { extra: -5, goalId: 1 })).toThrow(RangeError);
  expect(() => UpgradeChoice.options(JOB, { extra: 50, goalId: 9 })).toThrow("Choose a goal to raise.");
});

// normal case: the planner's quick estimate can compare both changes
test("works with MultiGoalPlanner.whatIf", () => {
  const { raise, safer } = UpgradeChoice.options(JOB, { extra: 5000, goalId: 2 });
  const raised = MultiGoalPlanner.whatIf(JOB, raise.changes);
  const safest = MultiGoalPlanner.whatIf(JOB, safer.changes);
  const house = (result) => result.goals.find((g) => g.goalId === 2);
  expect(house(raised).after).toBeLessThanOrEqual(house(raised).before);   // a bigger goal is never easier
  expect(raised.after.maxRiskLevel).toBe(4);
  expect(safest.after.maxRiskLevel).toBe(3);
  expect(house(safest).before).toBe(house(raised).before);   // both start from today's plan
});