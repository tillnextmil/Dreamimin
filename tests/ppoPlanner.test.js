// Unit tests for PpoPlanner: the planning environment, the DP benchmark, RL efficiency,
// and that the same inputs always give the same result.
// Author: Jessica Chang

const PpoPlanner = require("../src/ppoPlanner");

// A house down payment 7 years away. Few PPO rounds and paths keep the tests quick;
// determinism doesn't depend on how long the planner trains.
const JOB = { netWorth: 15000, monthlySaving: 900, cost: 110000, months: 84 };
const QUICK = { iterations: 10, evalPaths: 500 };

describe("rlEfficiency", () => {
  // normal case: RL's probability as a share of the benchmark's
  test("is the RL probability divided by the DP probability", () => {
    expect(PpoPlanner.rlEfficiency(0.45, 0.6)).toBeCloseTo(0.75);
    expect(PpoPlanner.rlEfficiency(0.6, 0.6)).toBe(1);
  });

  // edge case: on a finite set of paths RL can edge past the grid-based DP
  test("is capped at 1 when RL beats the benchmark", () => {
    expect(PpoPlanner.rlEfficiency(0.62, 0.6)).toBe(1);
  });

  // edge case: nothing to compare to when the benchmark can't reach the goal
  test("is null when the DP benchmark is 0", () => {
    expect(PpoPlanner.rlEfficiency(0, 0)).toBeNull();
  });

  // wrong case: anything that isn't a probability is rejected
  test.each([[-0.1, 0.5], [0.5, 1.2], [NaN, 0.5], ["0.5", 0.5]])("rejects %p and %p", (rl, dp) => {
    expect(() => PpoPlanner.rlEfficiency(rl, dp)).toThrow(RangeError);
  });
});

describe("makeEnv", () => {
  // normal case: whole years map straight to yearly steps of 12 months' saving
  test("turns 84 months into 7 yearly steps", () => {
    const env = PpoPlanner.makeEnv(JOB);
    expect(env).toEqual({ W0: 15000, s: 10800, C: 110000, T: 7, U: 1 });
  });

  // edge case: part of a year rounds up to a step, without adding savings
  test("spreads a part year's saving so the total put away stays the same", () => {
    const env = PpoPlanner.makeEnv({ ...JOB, months: 18 });
    expect(env.T).toBe(2);
    expect(env.s * env.T).toBeCloseTo(900 * 18);
  });

  // edge case: debt doesn't count as money to invest
  test("starts negative net worth at $0", () => {
    expect(PpoPlanner.makeEnv({ ...JOB, netWorth: -5000 }).W0).toBe(0);
  });

  // wrong case: inputs the planner can't use
  test.each([
    ["no months left", { months: 0 }],
    ["part months", { months: 12.5 }],
    ["more than 40 years", { months: 481 }],
    ["a $0 goal", { cost: 0 }],
    ["a missing net worth", { netWorth: undefined }],
  ])("rejects %s", (_, change) => {
    expect(() => PpoPlanner.makeEnv({ ...JOB, ...change })).toThrow(RangeError);
  });
});

describe("DP benchmark", () => {
  // normal case: the benchmark is at least as good as sticking with any one portfolio
  test("does at least as well as every fixed portfolio", () => {
    const env = PpoPlanner.makeEnv(JOB);
    const dp = PpoPlanner.evaluate(PpoPlanner.solveDP(env).choose, env, 2000).prob;
    PpoPlanner.PORTFOLIOS.forEach((_, j) => {
      expect(dp).toBeGreaterThanOrEqual(PpoPlanner.evaluate(() => j, env, 2000).prob - 0.01);
    });
  });
});

describe("plan", () => {
  // normal case: the same inputs give exactly the same result, run after run
  test("gives the same result for the same inputs", () => {
    const first = PpoPlanner.plan(JOB, QUICK);
    const second = PpoPlanner.plan(JOB, QUICK);
    expect(second).toEqual(first);
  });

  // normal case: an earlier run with other inputs doesn't change the next one
  test("doesn't depend on what ran before", () => {
    const before = PpoPlanner.plan(JOB, QUICK);
    PpoPlanner.plan({ ...JOB, cost: 60000, months: 36 }, QUICK);
    expect(PpoPlanner.plan(JOB, QUICK)).toEqual(before);
  });

  // normal case: the result carries RL efficiency against the DP benchmark
  test("reports RL efficiency against the DP benchmark", () => {
    const r = PpoPlanner.plan(JOB, QUICK);
    expect(r.prob).toBeGreaterThanOrEqual(0);
    expect(r.dp).toBeGreaterThan(0);
    expect(r.efficiency).toBe(PpoPlanner.rlEfficiency(r.prob, r.dp));
    expect(r.glide).toHaveLength(7);
    expect(r.p10).toBeLessThanOrEqual(r.p50);
    expect(r.p50).toBeLessThanOrEqual(r.p90);
  });

  // normal case: progress is reported, benchmark first, one message per PPO round
  test("reports the benchmark and then each round", () => {
    const messages = [];
    PpoPlanner.plan(JOB, { ...QUICK, onProgress: (m) => messages.push(m) });
    expect(messages[0].type).toBe("benchmark");
    expect(messages.slice(1).map((m) => m.done)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(messages[10].total).toBe(10);
  });

  // edge case: nothing saved and nothing to start with can't reach the goal
  test("has no RL efficiency when even the benchmark can't reach the goal", () => {
    const r = PpoPlanner.plan({ ...JOB, netWorth: 0, monthlySaving: 0 }, QUICK);
    expect(r.prob).toBe(0);
    expect(r.dp).toBe(0);
    expect(r.efficiency).toBeNull();
  });
});
