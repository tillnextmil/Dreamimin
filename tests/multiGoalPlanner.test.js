// Unit tests for MultiGoalPlanner: the planning timeline, the DP benchmark's take/skip/partial
// choices, the PPO plan, the five risk levels side by side, and what-if changes.
// Author: Jessica Chang

const MultiGoalPlanner = require("../src/multiGoalPlanner");
const PpoPlanner = require("../src/ppoPlanner");

// A trip in 8 months, a car in 2.5 years (a cheaper one would do) and a house deposit in 7 years.
const JOB = {
  netWorth: 20000,
  monthlySaving: 1200,
  goals: [
    { id: "trip", targetAmount: 6000, months: 8, priority: 2 },
    { id: "car", targetAmount: 25000, months: 30, priority: 4, minAcceptableAmount: 15000 },
    { id: "house", targetAmount: 90000, months: 84, priority: 5, minAcceptableAmount: 60000 },
  ],
};
// Few PPO rounds and paths keep the tests quick; determinism doesn't depend on how long the planner trains.
const QUICK = { iterations: 10, evalPaths: 500 };
const PATHS = { evalPaths: 2000 };

const goalOf = (plan, id) => plan.goals.find((g) => g.goalId === id);

describe("makeEnv", () => {
  // normal case: time stops at every goal date and every 12 months in between
  test("stops at each goal date and at least every 12 months", () => {
    const env = MultiGoalPlanner.makeEnv(JOB);
    expect(env.steps.map((s) => s.end)).toEqual([8, 12, 24, 30, 36, 48, 60, 72, 84]);
    expect(env.months).toBe(84);
    expect(env.years).toBe(7);
  });

  // normal case: each step saves for its own months, so nothing is saved twice or left out
  test("saves the monthly amount for every month of the plan", () => {
    const env = MultiGoalPlanner.makeEnv(JOB);
    expect(env.steps[0].save).toBe(1200 * 8);
    expect(env.steps[1].save).toBe(1200 * 4);
    expect(env.steps.reduce((sum, s) => sum + s.save, 0)).toBe(1200 * 84);
  });

  // normal case: a goal is decided right after the step that ends on its date
  test("decides each goal when it comes due", () => {
    const env = MultiGoalPlanner.makeEnv(JOB);
    const order = env.decisions.map((d) => (d.goal ? d.goal.id : "invest"));
    expect(order).toEqual(["invest", "trip", "invest", "invest", "invest", "car", "invest", "invest", "invest", "invest", "invest", "house"]);
  });

  // edge case: goals due the same month are decided most important first
  test("decides goals due the same month most important first", () => {
    const env = MultiGoalPlanner.makeEnv({
      ...JOB,
      goals: [
        { id: "low", targetAmount: 5000, months: 12, priority: 1 },
        { id: "high", targetAmount: 5000, months: 12, priority: 5 },
      ],
    });
    expect(env.decisions.map((d) => (d.goal ? d.goal.id : "invest"))).toEqual(["invest", "high", "low"]);
  });

  // edge case: what is left out gets its default, and debt doesn't count as money to invest
  test("defaults to priority 3, full amount only and every risk level", () => {
    const env = MultiGoalPlanner.makeEnv({ netWorth: -5000, monthlySaving: 100, goals: [{ id: 1, targetAmount: 1000, months: 6 }] });
    expect(env.W0).toBe(0);
    expect(env.cap).toBe(5);
    expect(env.goals[0]).toMatchObject({ priority: 3, min: 0 });
  });

  // wrong case: inputs the planner can't use
  test.each([
    ["no goals", { goals: [] }],
    ["21 goals", { goals: Array.from({ length: 21 }, (_, i) => ({ id: i, targetAmount: 100, months: 12 })) }],
    ["a goal without an id", { goals: [{ targetAmount: 100, months: 12 }] }],
    ["two goals with the same id", { goals: [{ id: 1, targetAmount: 100, months: 12 }, { id: 1, targetAmount: 200, months: 24 }] }],
    ["a $0 goal", { goals: [{ id: 1, targetAmount: 0, months: 12 }] }],
    ["no months left", { goals: [{ id: 1, targetAmount: 100, months: 0 }] }],
    ["part months", { goals: [{ id: 1, targetAmount: 100, months: 12.5 }] }],
    ["more than 40 years", { goals: [{ id: 1, targetAmount: 100, months: 481 }] }],
    ["a priority of 6", { goals: [{ id: 1, targetAmount: 100, months: 12, priority: 6 }] }],
    ["a smallest amount equal to the goal", { goals: [{ id: 1, targetAmount: 100, months: 12, minAcceptableAmount: 100 }] }],
    ["a negative smallest amount", { goals: [{ id: 1, targetAmount: 100, months: 12, minAcceptableAmount: -1 }] }],
    ["a risk level of 0", { maxRiskLevel: 0 }],
    ["a risk level of 6", { maxRiskLevel: 6 }],
    ["a missing net worth", { netWorth: undefined }],
    ["a monthly saving that isn't a number", { monthlySaving: "1200" }],
  ])("rejects %s", (_, change) => {
    expect(() => MultiGoalPlanner.makeEnv({ ...JOB, ...change })).toThrow(RangeError);
  });
});

describe("DP benchmark", () => {
  // normal case: with one whole-year goal it is the same model as PpoPlanner
  test("gives one goal the same chance as PpoPlanner's benchmark", () => {
    const single = { netWorth: 15000, monthlySaving: 900, cost: 110000, months: 84 };
    const env = PpoPlanner.makeEnv(single);
    const expected = PpoPlanner.evaluate(PpoPlanner.solveDP(env).choose, env, 2000).prob;
    const plan = MultiGoalPlanner.estimate(
      { netWorth: 15000, monthlySaving: 900, goals: [{ id: "house", targetAmount: 110000, months: 84 }] }, PATHS);
    expect(plan.goals[0].pFull).toBeCloseTo(expected, 10);
    expect(plan.goals[0].pPartial).toBe(0);
  });

  // normal case: when the money covers one of two goals, the more important one gets it
  test("funds the more important goal when both can't be reached", () => {
    const plan = MultiGoalPlanner.estimate({
      netWorth: 10500, monthlySaving: 0, maxRiskLevel: 1,
      goals: [
        { id: "low", targetAmount: 10000, months: 12, priority: 1 },
        { id: "high", targetAmount: 10000, months: 12, priority: 5 },
      ],
    }, PATHS);
    expect(goalOf(plan, "high").pFull).toBeGreaterThan(0.9);
    expect(goalOf(plan, "low").pFull).toBeLessThan(0.05);
  });

  // normal case: an affordable goal is skipped when paying for it would cost a more important one later
  test("skips an early goal to keep the money for a more important later one", () => {
    const plan = MultiGoalPlanner.estimate({
      netWorth: 12000, monthlySaving: 0, maxRiskLevel: 1,
      goals: [
        { id: "early", targetAmount: 9000, months: 12, priority: 1 },
        { id: "later", targetAmount: 10000, months: 24, priority: 5 },
      ],
    }, PATHS);
    expect(goalOf(plan, "early").pAny).toBeLessThan(0.05);
    expect(goalOf(plan, "later").pFull).toBeGreaterThan(0.9);
  });

  // normal case: the smallest acceptable amount is taken when the full amount is out of reach
  test("funds a goal in part when only the smallest acceptable amount is affordable", () => {
    const plan = MultiGoalPlanner.estimate({
      netWorth: 7000, monthlySaving: 0, maxRiskLevel: 1,
      goals: [{ id: "car", targetAmount: 10000, months: 12, priority: 3, minAcceptableAmount: 5000 }],
    }, PATHS);
    const car = plan.goals[0];
    expect(car.pFull).toBeLessThan(0.05);
    expect(car.pPartial).toBeGreaterThan(0.9);
    expect(car.pAny).toBeCloseTo(car.pFull + car.pPartial, 12);
    // part of a goal earns that share of its priority: 3 * 5000 / 10000 when always in part
    expect(plan.utility).toBeCloseTo(3 * car.pFull + 1.5 * car.pPartial, 10);
  });

  // edge case: without a smallest acceptable amount there is no part funding
  test("never funds in part a goal that only counts in full", () => {
    const plan = MultiGoalPlanner.estimate({
      netWorth: 7000, monthlySaving: 0, goals: [{ id: "car", targetAmount: 10000, months: 12 }],
    }, PATHS);
    expect(plan.goals[0].pPartial).toBe(0);
  });

  // normal case: the plan never holds a portfolio riskier than the user's risk level
  test.each([1, 2, 3, 4, 5])("stays within risk level %i", (maxRiskLevel) => {
    const plan = MultiGoalPlanner.estimate({ ...JOB, maxRiskLevel }, QUICK);
    expect(plan.maxRiskLevel).toBe(maxRiskLevel);
    expect(plan.riskLevelByYear).toHaveLength(7);
    plan.riskLevelByYear.forEach((level) => {
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(maxRiskLevel);
    });
  });

  // normal case: the benchmark is at least as good as taking every goal the moment it is affordable
  test("does at least as well as taking every affordable goal in one fixed portfolio", () => {
    const tight = {
      netWorth: 5000, monthlySaving: 600,
      goals: [
        { id: "laptop", targetAmount: 3000, months: 6, priority: 1 },
        { id: "wedding", targetAmount: 30000, months: 36, priority: 5 },
        { id: "car", targetAmount: 20000, months: 36, priority: 3, minAcceptableAmount: 10000 },
      ],
    };
    const env = MultiGoalPlanner.makeEnv(tight);
    const dp = MultiGoalPlanner.evaluate(MultiGoalPlanner.solveDP(env), env, 2000).utility;
    PpoPlanner.PORTFOLIOS.forEach((_, j) => {
      const takeAll = { invest: () => j, goal: () => MultiGoalPlanner.ACTIONS.full };
      expect(dp).toBeGreaterThanOrEqual(MultiGoalPlanner.evaluate(takeAll, env, 2000).utility - 0.02);
    });
  });

  // edge case: 20 goals over 40 years, the most the planner takes, still plans
  test("plans 20 goals over 40 years", () => {
    const goals = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1, targetAmount: 5000 + 4000 * i, months: 24 * (i + 1), priority: 1 + (i % 5), minAcceptableAmount: i % 2 ? 2500 : 0,
    }));
    const plan = MultiGoalPlanner.estimate({ netWorth: 10000, monthlySaving: 700, goals }, QUICK);
    expect(plan.goals.map((g) => g.goalId)).toEqual(goals.map((g) => g.id));
    expect(plan.riskLevelByYear).toHaveLength(40);
    plan.goals.forEach((g) => {
      expect(g.pFull).toBeGreaterThanOrEqual(0);
      expect(g.pAny).toBeLessThanOrEqual(1);
    });
  });
});

describe("rlEfficiency", () => {
  // normal case: the plan's utility as a share of the benchmark's
  test("is the utility divided by the DP utility", () => {
    expect(MultiGoalPlanner.rlEfficiency(4.5, 6)).toBeCloseTo(0.75);
    expect(MultiGoalPlanner.rlEfficiency(6, 6)).toBe(1);
  });

  // edge case: on a finite set of paths RL can edge past the grid-based DP
  test("is capped at 1 when RL beats the benchmark", () => {
    expect(MultiGoalPlanner.rlEfficiency(6.2, 6)).toBe(1);
  });

  // edge case: nothing to compare to when the benchmark can't reach any goal
  test("is null when the DP utility is 0", () => {
    expect(MultiGoalPlanner.rlEfficiency(0, 0)).toBeNull();
  });

  // wrong case: anything that isn't a utility is rejected
  test.each([[-0.1, 5], [5, -1], [NaN, 5], ["5", 5], [5, Infinity]])("rejects %p and %p", (utility, dpUtility) => {
    expect(() => MultiGoalPlanner.rlEfficiency(utility, dpUtility)).toThrow(RangeError);
  });
});

describe("training budget", () => {
  // normal case: short plans get more rounds and more trajectories, long plans fewer, within fixed limits
  test("gives long plans fewer rounds and trajectories", () => {
    expect(MultiGoalPlanner.iterationsFor(8)).toBe(260);
    expect(MultiGoalPlanner.iterationsFor(15)).toBe(150);
    expect(MultiGoalPlanner.iterationsFor(76)).toBe(100);
    expect(MultiGoalPlanner.episodesFor(8)).toBe(64);
    expect(MultiGoalPlanner.episodesFor(30)).toBe(32);
    expect(MultiGoalPlanner.episodesFor(76)).toBe(24);
  });
});

describe("plan", () => {
  // normal case: the same inputs give exactly the same result, run after run
  test("gives the same result for the same inputs", () => {
    expect(MultiGoalPlanner.plan(JOB, QUICK)).toEqual(MultiGoalPlanner.plan(JOB, QUICK));
  });

  // normal case: an earlier run with other inputs doesn't change the next one
  test("doesn't depend on what ran before", () => {
    const before = MultiGoalPlanner.plan(JOB, QUICK);
    MultiGoalPlanner.plan({ ...JOB, monthlySaving: 300, maxRiskLevel: 2 }, QUICK);
    expect(MultiGoalPlanner.plan(JOB, QUICK)).toEqual(before);
  });

  // normal case: the result has what POST /api/plans takes, plus the benchmark's chances and a timeline
  test("reports every goal, the risk level each year and RL efficiency", () => {
    const r = MultiGoalPlanner.plan({ ...JOB, maxRiskLevel: 3 }, QUICK);
    expect(r.maxRiskLevel).toBe(3);
    expect(r.goals.map((g) => g.goalId)).toEqual(["trip", "car", "house"]);
    r.goals.forEach((g) => {
      expect(g.pFull).toBeGreaterThanOrEqual(0);
      expect(g.pPartial).toBeGreaterThanOrEqual(0);
      expect(g.pAny).toBeLessThanOrEqual(1);
    });
    expect(r.years).toBe(7);
    expect(r.riskLevelByYear).toHaveLength(7);
    r.riskLevelByYear.forEach((level) => expect(level).toBeLessThanOrEqual(3));
    expect(r.dpUtility).toBeGreaterThan(0);
    expect(r.rlEfficiency).toBe(MultiGoalPlanner.rlEfficiency(r.utility, r.dpUtility));
    expect(r.portfolios).toEqual(["Cautious", "Conservative", "Balanced", "Growth", "Aggressive"]);
  });

  // normal case: the benchmark in the result is the quick estimate for the same job
  test("reports the same benchmark as estimate", () => {
    const r = MultiGoalPlanner.plan(JOB, QUICK);
    const estimate = MultiGoalPlanner.estimate(JOB, QUICK);
    expect(r.dpUtility).toBe(estimate.utility);
    expect(r.benchmarkGoals).toEqual(estimate.goals);
  });

  // normal case: the timeline has the money left at each stop in a bad, typical and good market
  test("reports the money left at each stop", () => {
    const r = MultiGoalPlanner.plan(JOB, QUICK);
    expect(r.timeline.map((t) => t.month)).toEqual([8, 12, 24, 30, 36, 48, 60, 72, 84]);
    r.timeline.forEach((t) => {
      expect(t.p10).toBeLessThanOrEqual(t.p50);
      expect(t.p50).toBeLessThanOrEqual(t.p90);
    });
  });

  // normal case: progress is reported, benchmark first, one message per PPO round
  test("reports the benchmark and then each round", () => {
    const messages = [];
    MultiGoalPlanner.plan(JOB, { ...QUICK, onProgress: (m) => messages.push(m) });
    expect(messages[0].type).toBe("benchmark");
    expect(messages[0].goals).toHaveLength(3);
    expect(messages.slice(1).map((m) => m.done)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(messages[1].utility).toBeNull();          // nothing scored before the first check
    expect(messages[10].utility).toBeGreaterThan(0);
    expect(messages[10].total).toBe(10);
  });

  // normal case: a short training run already gets close to the benchmark
  test("gets within 10% of the DP benchmark's utility", () => {
    const r = MultiGoalPlanner.plan(JOB, { iterations: 40, evalPaths: 1000 });
    expect(r.rlEfficiency).toBeGreaterThanOrEqual(0.9);
  });

  // edge case: nothing saved and nothing to start with can't reach any goal
  test("has no RL efficiency when even the benchmark can't reach a goal", () => {
    const r = MultiGoalPlanner.plan({ ...JOB, netWorth: 0, monthlySaving: 0 }, QUICK);
    expect(r.utility).toBe(0);
    expect(r.dpUtility).toBe(0);
    expect(r.rlEfficiency).toBeNull();
    r.goals.forEach((g) => expect(g.pAny).toBe(0));
  });
});

describe("compareRiskLevels", () => {
  // A house deposit that needs growth, so the risk level matters.
  const STRETCH = { netWorth: 15000, monthlySaving: 900, goals: [{ id: "house", targetAmount: 110000, months: 84 }] };

  // normal case: one estimate per risk level, lowest first, named after its riskiest portfolio
  test("gives the five risk levels, lowest first", () => {
    const levels = MultiGoalPlanner.compareRiskLevels(STRETCH, PATHS);
    expect(levels.map((l) => l.maxRiskLevel)).toEqual([1, 2, 3, 4, 5]);
    expect(levels.map((l) => l.portfolio)).toEqual(["Cautious", "Conservative", "Balanced", "Growth", "Aggressive"]);
    levels.forEach((l) => expect(l.goals).toHaveLength(1));
  });

  // normal case: each level is the estimate for that level, so a preview matches what is then saved
  test("matches the estimate at each level", () => {
    const levels = MultiGoalPlanner.compareRiskLevels(STRETCH, PATHS);
    const three = MultiGoalPlanner.estimate({ ...STRETCH, maxRiskLevel: 3 }, PATHS);
    expect(levels[2]).toEqual({ ...three, portfolio: "Balanced" });
  });

  // normal case: allowing more risk gives the plan more choices, so a stretch goal's chance rises
  test("raises a stretch goal's chance as more risk is allowed", () => {
    const chances = MultiGoalPlanner.compareRiskLevels(STRETCH, PATHS).map((l) => l.goals[0].pAny);
    for (let i = 1; i < chances.length; i++) expect(chances[i]).toBeGreaterThan(chances[i - 1]);
  });
});

describe("whatIf", () => {
  const STRETCH = { netWorth: 15000, monthlySaving: 900, goals: [{ id: "house", targetAmount: 110000, months: 84 }] };

  // normal case: saving more raises the chance, and the change is after minus before
  test("shows how saving more moves a goal's chance", () => {
    const r = MultiGoalPlanner.whatIf(STRETCH, { monthlySaving: 1100 }, PATHS);
    const [house] = r.goals;
    expect(house.goalId).toBe("house");
    expect(house.before).toBe(r.before.goals[0].pAny);
    expect(house.after).toBe(r.after.goals[0].pAny);
    expect(house.change).toBeCloseTo(house.after - house.before, 12);
    expect(house.change).toBeGreaterThan(0);
    expect(r.utilityChange).toBeGreaterThan(0);
  });

  // normal case: the risk level can be the thing that changes
  test("shows how a lower risk level moves a goal's chance", () => {
    const r = MultiGoalPlanner.whatIf(STRETCH, { maxRiskLevel: 1 }, PATHS);
    expect(r.after.maxRiskLevel).toBe(1);
    expect(r.goals[0].change).toBeLessThan(0);
  });

  // edge case: changing nothing changes nothing
  test("has no change when nothing changes", () => {
    const r = MultiGoalPlanner.whatIf(JOB, {}, QUICK);
    r.goals.forEach((g) => expect(g.change).toBe(0));
    expect(r.utilityChange).toBe(0);
  });

  // edge case: a goal that is only in one of the two plans has nothing to compare
  test("has no change for a goal that is added or removed", () => {
    const withoutTrip = JOB.goals.filter((g) => g.id !== "trip");
    const r = MultiGoalPlanner.whatIf(JOB, { goals: withoutTrip }, QUICK);
    const trip = r.goals.find((g) => g.goalId === "trip");
    expect(trip.before).toBeGreaterThan(0);
    expect(trip.after).toBeNull();
    expect(trip.change).toBeNull();
  });

  // wrong case: a change the planner can't use is rejected
  test("rejects a change that isn't valid", () => {
    expect(() => MultiGoalPlanner.whatIf(JOB, { monthlySaving: NaN }, QUICK)).toThrow(RangeError);
  });
});
