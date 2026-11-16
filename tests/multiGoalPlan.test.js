// Unit tests for MultiGoalPlan: building it from a planner result, each goal's verdict,
// the body it gives POST /api/plans, and rejecting results that don't make sense.
// Author: Jessica Chang

const MultiGoalPlan = require("../src/multiGoalPlan");
const GoalProbability = require("../src/goalProbability");
const MultiGoalPlanner = require("../src/multiGoalPlanner");

// A plan for two goals over 4 years at risk level 3.
const RESULT = {
  maxRiskLevel: 3,
  utility: 6.1,
  dpUtility: 6.5,
  rlEfficiency: 0.94,
  riskLevelByYear: [3, 3, 2, 1],
  goals: [
    { goalId: 3, pFull: 0.62, pPartial: 0.21 },
    { goalId: 5, pFull: 0.3, pPartial: 0 },
  ],
};

function planWith(changes) {
  return new MultiGoalPlan({ ...RESULT, ...changes });
}

// normal case: the planner's numbers are kept
test("keeps the planner's result", () => {
  const plan = new MultiGoalPlan(RESULT);
  expect(plan.maxRiskLevel).toBe(3);
  expect(plan.utility).toBe(6.1);
  expect(plan.dpUtility).toBe(6.5);
  expect(plan.rlEfficiency).toBe(0.94);
  expect(plan.riskLevelByYear).toEqual([3, 3, 2, 1]);
  expect(plan.goals).toHaveLength(2);
});

// normal case: a goal's chance counts reaching it in full or in part, and sets its verdict
test("gives each goal its chance and verdict", () => {
  const car = new MultiGoalPlan(RESULT).goal(3);
  expect(car.full).toBeInstanceOf(GoalProbability);
  expect(car.full.value).toBe(0.62);
  expect(car.partial.value).toBe(0.21);
  expect(car.chance.value).toBeCloseTo(0.83);
  expect(car.verdict).toBe("Realistic");
  expect(new MultiGoalPlan(RESULT).goal(5).verdict).toBe("A stretch");
});

// edge case: the verdict changes exactly at the threshold, counting the partial chance
test("counts the partial chance toward the verdict", () => {
  const plan = planWith({ goals: [{ goalId: 1, pFull: 0.5, pPartial: 0.3 }, { goalId: 2, pFull: 0.5, pPartial: 0.25 }] });
  expect(plan.goal(1).verdict).toBe("Realistic");
  expect(plan.goal(2).verdict).toBe("Within reach");
});

// edge case: asking for a goal the plan doesn't have
test("has nothing for a goal that isn't in the plan", () => {
  expect(new MultiGoalPlan(RESULT).goal(99)).toBeUndefined();
});

// normal case: RL efficiency shows as a whole percent
test("shows RL efficiency as a percent", () => {
  expect(new MultiGoalPlan(RESULT).efficiencyText()).toBe("94%");
  expect(planWith({ rlEfficiency: 1 }).efficiencyText()).toBe("100%");
});

// edge case: no RL efficiency when the benchmark can't reach any goal
test("shows a dash when there is no RL efficiency", () => {
  const plan = planWith({ utility: 0, dpUtility: 0, rlEfficiency: null });
  expect(plan.rlEfficiency).toBeNull();
  expect(plan.efficiencyText()).toBe("–");
});

// normal case: toJSON is the body POST /api/plans takes, with nothing extra
test("gives the body POST /api/plans takes", () => {
  expect(new MultiGoalPlan(RESULT).toJSON()).toEqual(RESULT);
  expect(JSON.parse(JSON.stringify(new MultiGoalPlan(RESULT)))).toEqual(RESULT);
});

// normal case: works with what the real planner returns, extra fields and all
test("can be built from a real planner result", () => {
  const planned = MultiGoalPlanner.plan({
    netWorth: 20000, monthlySaving: 1200, maxRiskLevel: 4,
    goals: [
      { id: "car", targetAmount: 25000, months: 30, priority: 4, minAcceptableAmount: 15000 },
      { id: "house", targetAmount: 90000, months: 84, priority: 5 },
    ],
  }, { iterations: 10, evalPaths: 500 });
  const plan = new MultiGoalPlan(planned);
  expect(plan.goals.map((g) => g.goalId)).toEqual(["car", "house"]);
  expect(plan.goal("car").full.value).toBe(planned.goals[0].pFull);
  expect(plan.riskLevelByYear).toHaveLength(7);
  expect(plan.toJSON().goals[1]).toEqual({ goalId: "house", pFull: planned.goals[1].pFull, pPartial: planned.goals[1].pPartial });
});

// normal case: a plan can't be changed after it is created
test("can't be changed", () => {
  const plan = new MultiGoalPlan(RESULT);
  expect(Object.isFrozen(plan)).toBe(true);
  expect(Object.isFrozen(plan.goals)).toBe(true);
  expect(Object.isFrozen(plan.goals[0])).toBe(true);
  expect(Object.isFrozen(plan.riskLevelByYear)).toBe(true);
});

// edge case: full and partial chances that add up to exactly 1
test("accepts chances that add up to 1", () => {
  const plan = planWith({ goals: [{ goalId: 1, pFull: 0.7, pPartial: 0.3 }] });
  expect(plan.goal(1).chance.value).toBe(1);
});

// wrong case: results that don't make sense are rejected
test.each([
  ["a risk level of 0", { maxRiskLevel: 0 }],
  ["a risk level of 6", { maxRiskLevel: 6 }],
  ["a negative utility", { utility: -1 }],
  ["a DP utility that isn't a number", { dpUtility: "6.5" }],
  ["RL efficiency above 1", { rlEfficiency: 1.2 }],
  ["RL efficiency left out", { rlEfficiency: undefined }],
  ["no years", { riskLevelByYear: [] }],
  ["41 years", { riskLevelByYear: new Array(41).fill(1) }],
  ["a year above the plan's risk level", { riskLevelByYear: [4, 3] }],
  ["a year with no risk level", { riskLevelByYear: [3, 0] }],
  ["no goals", { goals: [] }],
  ["a goal without an id", { goals: [{ pFull: 0.5, pPartial: 0 }] }],
  ["two goals with the same id", { goals: [{ goalId: 1, pFull: 0.5, pPartial: 0 }, { goalId: 1, pFull: 0.2, pPartial: 0 }] }],
  ["chances that add up to more than 1", { goals: [{ goalId: 1, pFull: 0.7, pPartial: 0.4 }] }],
  ["a chance above 1", { goals: [{ goalId: 1, pFull: 1.1, pPartial: 0 }] }],
])("rejects %s", (_, change) => {
  expect(() => planWith(change)).toThrow(RangeError);
});

// wrong case: a chance that isn't a number
test("rejects a chance that isn't a number", () => {
  expect(() => planWith({ goals: [{ goalId: 1, pFull: "0.5", pPartial: 0 }] })).toThrow(TypeError);
});
