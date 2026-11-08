const cognifiPlanner = require("../mvp/planner.worker");

const planner = cognifiPlanner({});

function job(overrides = {}) {
  return {
    netWorth: 50000,
    income: 5000,
    expenses: 5000,
    riskTolerance: 2,
    goals: [
      { id: "home", name: "Home", cost: 40000, years: 2, partial: 20000, importance: 5 },
      { id: "school", name: "School", cost: 10000, years: 1, partial: 0, importance: 3 },
    ],
    ...overrides,
  };
}

test("normalizes goal deadlines, priorities, and risk tolerance", () => {
  const normalized = planner.normalizeMultiGoalJob(job());

  expect(normalized.T).toBe(2);
  expect(normalized.cap).toBe(2);
  expect(normalized.goals.map((goal) => goal.id)).toEqual(["school", "home"]);
  expect(normalized.goals.map((goal) => goal.importance)).toEqual([3, 5]);
});

test.each([
  [job({ goals: [] }), "between 1 and 20"],
  [job({ goals: [{ id: "bad", cost: 0, years: 1 }] }), "positive finite cost"],
  [job({ goals: [{ id: "bad", cost: 10, years: 0 }] }), "due in 1 to 40 years"],
  [job({ goals: [{ id: "bad", cost: 10, years: 1, partial: 10 }] }), "partial amount"],
  [job({ goals: [{ id: "bad", cost: 10, years: 1, importance: 6 }] }), "importance"],
  [job({ goals: [{ id: "same", cost: 10, years: 1 }, { id: "same", cost: 20, years: 2 }] }), "unique"],
  [job({ riskTolerance: 5 }), "Risk tolerance"],
])("rejects invalid multi-goal input: %s", (input, message) => {
  expect(() => planner.normalizeMultiGoalJob(input)).toThrow(message);
});

test("DP policy and Monte Carlo evaluation report each goal's funding odds", () => {
  const normalized = planner.normalizeMultiGoalJob(job());
  const dp = planner.solveMultiDP(normalized, normalized.cap);
  const result = planner.evaluateMulti(planner.dpChooser(dp), normalized, 200);

  expect(Number.isFinite(dp.expectedUtility)).toBe(true);
  expect(result.utility).toBeGreaterThan(0);
  expect(result.goals).toHaveLength(2);
  for (const goal of result.goals) {
    expect(goal.pFull).toBeGreaterThanOrEqual(0);
    expect(goal.pFull).toBeLessThanOrEqual(1);
    expect(goal.pPartial).toBeGreaterThanOrEqual(0);
    expect(goal.pAny).toBe(goal.pFull + goal.pPartial);
    expect(["Realistic", "Within reach", "A stretch", "Not realistic yet"]).toContain(goal.verdict);
  }
});

test("planner returns PPO and DP metrics for every risk cap", () => {
  const progress = [];
  const result = planner.planMultiGoal(job({
    netWorth: 50000,
    income: 0,
    expenses: 0,
    riskTolerance: 0,
    goals: [{ id: "trip", name: "Trip", cost: 1000, years: 1, importance: 2 }],
  }), null, (update) => progress.push(update), { iterations: 1, paths: 50, seed: 7 });

  expect(result.mode).toBe("multi");
  expect(result.riskTolerance).toBe(0);
  expect(result.glide).toEqual([0]);
  expect(result.goals).toHaveLength(1);
  expect(result.dpGoals).toHaveLength(1);
  expect(result.riskComparison).toHaveLength(5);
  expect(result.rlEfficiency).toBeGreaterThanOrEqual(0);
  expect(result.weights.mode).toBe("multi");
  expect(progress).toEqual([{ done: 1, total: 1, utility: expect.any(Number) }]);
});
