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

// normal case: with the portfolio names, the risk level each year reads as stages
// Author: Aiyan Tong
describe("describeGlide", () => {
  const NAMES = ["Cautious", "Conservative", "Balanced", "Growth", "Aggressive"];

  test("names each run of years and the year it ends", () => {
    const plan = planWith({ portfolios: NAMES });
    expect(plan.glideStages()).toEqual([
      { portfolio: "Balanced", firstYear: 0, lastYear: 1 },
      { portfolio: "Conservative", firstYear: 2, lastYear: 2 },
      { portfolio: "Cautious", firstYear: 3, lastYear: 3 },
    ]);
    expect(plan.describeGlide(2026)).toBe("Balanced until 2028, Conservative to 2029, then Cautious.");
  });

  // edge case: one risk level the whole way
  test("says when the plan never changes", () => {
    expect(planWith({ portfolios: NAMES, riskLevelByYear: [2, 2, 2] }).describeGlide(2026)).toBe("Conservative the whole way.");
  });

  // edge case: without names, each stage says its risk level
  test("uses the risk level without portfolio names", () => {
    expect(planWith({ riskLevelByYear: [3, 1] }).describeGlide(2026)).toBe("Risk level 3 until 2027, then Risk level 1.");
  });

  // normal case: the planner's result already has the names
  test("takes the names from the planner's result", () => {
    const r = MultiGoalPlanner.plan(
      { netWorth: 5000, monthlySaving: 400, goals: [{ id: 1, targetAmount: 9000, months: 24 }] },
      { iterations: 10, evalPaths: 300 },
    );
    expect(new MultiGoalPlan(r).portfolios).toEqual(NAMES);
  });

  // wrong case: names that aren't five strings
  test.each([
    ["four names", NAMES.slice(1)],
    ["a blank name", ["", ...NAMES.slice(1)]],
    ["not a list", "Balanced"],
  ])("rejects %s", (_, portfolios) => {
    expect(() => planWith({ portfolios })).toThrow(TypeError);
  });
});

// normal case: how many goals are Realistic (80% or more, in full or in part)
test("counts the realistic goals", () => {
  expect(planWith({}).realisticCount()).toBe(1);   // 62% + 21% = 83%, and 30%
  expect(planWith({ goals: [{ goalId: 1, pFull: 0.79, pPartial: 0 }] }).realisticCount()).toBe(0);
  expect(planWith({ goals: [{ goalId: 1, pFull: 0.8, pPartial: 0 }] }).realisticCount()).toBe(1);
});

// normal case: validate gives a message per invalid field, for the API's 400 body
// Author: Aiyan Tong
describe("validate", () => {
  test("is empty for a valid result", () => {
    expect(MultiGoalPlan.validate(RESULT)).toEqual({});
  });

  test("names every invalid field once", () => {
    expect(MultiGoalPlan.validate({ maxRiskLevel: 0, utility: -1, dpUtility: 6.5, rlEfficiency: 2, riskLevelByYear: [], goals: [] })).toEqual({
      maxRiskLevel: "Choose a risk level from 1 to 5.",
      utility: "Utility must be a number of 0 or more.",
      rlEfficiency: "RL efficiency must be between 0 and 1, or null.",
      riskLevelByYear: "A plan covers 1 to 40 years.",
      goals: "A plan needs at least one goal.",
    });
  });

  // edge case: a bad risk level doesn't also flag every year as above it
  test("checks the years against level 5 when the plan's risk level is invalid", () => {
    expect(MultiGoalPlan.validate({ ...RESULT, maxRiskLevel: 9, riskLevelByYear: [5, 4] })).toEqual({
      maxRiskLevel: "Choose a risk level from 1 to 5.",
    });
  });

  // edge case: nothing at all, or a goal that is null
  test("handles a missing result and a missing goal", () => {
    expect(Object.keys(MultiGoalPlan.validate(undefined))).toEqual(["maxRiskLevel", "utility", "dpUtility", "rlEfficiency", "riskLevelByYear", "goals"]);
    expect(MultiGoalPlan.validate({ ...RESULT, goals: [null] })).toEqual({ goals: "Every goal needs an id." });
  });

  // normal case: validate and the constructor agree on every case the constructor rejects
  test.each([
    { maxRiskLevel: 6 }, { utility: -1 }, { dpUtility: "6.5" }, { rlEfficiency: 1.2 }, { riskLevelByYear: [4, 3] },
    { goals: [{ goalId: 1, pFull: 0.7, pPartial: 0.4 }] }, { goals: [{ goalId: 1, pFull: "0.5", pPartial: 0 }] },
    { portfolios: ["one"] },
  ])("agrees with the constructor for %p", (change) => {
    const errors = MultiGoalPlan.validate({ ...RESULT, ...change });
    expect(Object.keys(errors)).toHaveLength(1);
    expect(() => planWith(change)).toThrow(Object.values(errors)[0]);
  });
});
