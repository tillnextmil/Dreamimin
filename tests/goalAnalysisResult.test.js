// Unit tests for GoalAnalysisResult: building it from a planner result, the glide path
// description, and rejecting results that don't make sense.
// Author: Aiyan Tong

const GoalAnalysisResult = require("../src/goalAnalysisResult");
const GoalProbability = require("../src/goalProbability");
const PpoPlanner = require("../src/ppoPlanner");

const PORTFOLIOS = ["Cautious", "Conservative", "Balanced", "Growth", "Aggressive"];

// A planner result for a goal 4 years away: Growth for two years, then Balanced, then Conservative.
const RESULT = {
  prob: 0.72, dp: 0.8, efficiency: 0.9,
  p10: 40000, p50: 65000, p90: 90000,
  years: 4, glide: [3, 3, 2, 1], portfolios: PORTFOLIOS,
};

function resultWith(changes) {
  return new GoalAnalysisResult({ ...RESULT, ...changes });
}

// normal case: the planner's numbers are kept, with both probabilities as GoalProbability
test("keeps the planner's result", () => {
  const r = new GoalAnalysisResult(RESULT);
  expect(r.probability).toBeInstanceOf(GoalProbability);
  expect(r.probability.value).toBe(0.72);
  expect(r.probability.verdict).toBe("Within reach");
  expect(r.benchmark.value).toBe(0.8);
  expect(r.efficiency).toBe(0.9);
  expect(r.outcomes).toEqual({ bad: 40000, typical: 65000, good: 90000 });
  expect(r.years).toBe(4);
});

// normal case: works with what the real planner returns
test("can be built from a real planner result", () => {
  const job = { netWorth: 15000, monthlySaving: 900, cost: 110000, months: 84 };
  const planned = PpoPlanner.plan(job, { iterations: 10, evalPaths: 500 });
  const r = new GoalAnalysisResult(planned);
  expect(r.probability.value).toBe(planned.prob);
  expect(r.years).toBe(7);
  expect(r.glide).toHaveLength(7);
});

// normal case: RL efficiency shows as a whole percent
test("shows RL efficiency as a percent", () => {
  expect(resultWith({ efficiency: 0.9 }).efficiencyText()).toBe("90%");
  expect(resultWith({ efficiency: 1 }).efficiencyText()).toBe("100%");
});

// edge case: no RL efficiency when the benchmark can't reach the goal
test("shows a dash when there is no RL efficiency", () => {
  const r = resultWith({ prob: 0, dp: 0, efficiency: null });
  expect(r.efficiency).toBeNull();
  expect(r.efficiencyText()).toBe("–");
});

// normal case: years on the same portfolio are grouped into stages
test("groups the glide path into stages", () => {
  expect(new GoalAnalysisResult(RESULT).glideStages()).toEqual([
    { portfolio: "Growth", firstYear: 0, lastYear: 1 },
    { portfolio: "Balanced", firstYear: 2, lastYear: 2 },
    { portfolio: "Conservative", firstYear: 3, lastYear: 3 },
  ]);
});

// normal case: the glide path reads as a sentence with calendar years
test("describes a glide path with several stages", () => {
  expect(new GoalAnalysisResult(RESULT).describeGlide(2026)).toBe("Growth until 2028, Balanced to 2029, then Conservative.");
});

// edge case: two stages have no middle part
test("describes a glide path with two stages", () => {
  expect(resultWith({ years: 3, glide: [4, 2, 2] }).describeGlide(2026)).toBe("Aggressive until 2027, then Balanced.");
});

// edge case: one portfolio the whole way, including a one-year goal
test("describes a glide path with one portfolio", () => {
  expect(resultWith({ glide: [2, 2, 2, 2] }).describeGlide(2026)).toBe("Balanced the whole way.");
  expect(resultWith({ years: 1, glide: [0] }).describeGlide(2026)).toBe("Cautious the whole way.");
});

// wrong case: probabilities outside 0 to 1 are rejected by GoalProbability
test("rejects a probability outside 0 to 1", () => {
  expect(() => resultWith({ prob: 1.2 })).toThrow(RangeError);
  expect(() => resultWith({ dp: -0.1 })).toThrow(RangeError);
});

// wrong case: RL efficiency must be between 0 and 1, or null
test.each([-0.1, 1.1, NaN, undefined, "0.9"])("rejects the efficiency %p", (efficiency) => {
  expect(() => resultWith({ efficiency })).toThrow(RangeError);
});

// wrong case: outcomes must be numbers in order from bad to good
test("rejects outcomes that aren't numbers or are out of order", () => {
  expect(() => resultWith({ p50: NaN })).toThrow(TypeError);
  expect(() => resultWith({ p10: 70000 })).toThrow(RangeError);
  expect(() => resultWith({ p90: 60000 })).toThrow(RangeError);
});

// wrong case: the glide path needs one valid portfolio per year
test("rejects a glide path that doesn't match the years or the portfolios", () => {
  expect(() => resultWith({ glide: [3, 2, 1] })).toThrow("one portfolio per year");
  expect(() => resultWith({ glide: [3, 3, 2, 5] })).toThrow("name one of the portfolios");
  expect(() => resultWith({ glide: [3, 3, 2, -1] })).toThrow("name one of the portfolios");
  expect(() => resultWith({ years: 0, glide: [] })).toThrow(RangeError);
  expect(() => resultWith({ portfolios: [] })).toThrow(TypeError);
});

// edge case: the result and its lists can't be changed after it is created
test("can't be changed after it is created", () => {
  const glide = [3, 3, 2, 1];
  const r = resultWith({ glide });
  glide[0] = 0;   // changing the planner's array afterwards doesn't reach the result
  expect(r.glide[0]).toBe(3);
  expect(Object.isFrozen(r)).toBe(true);
  expect(Object.isFrozen(r.glide)).toBe(true);
  expect(Object.isFrozen(r.outcomes)).toBe(true);
});
