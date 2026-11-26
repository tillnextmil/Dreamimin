/* ============================================================
   MultiGoalPlanner — plans every goal together, from one pot of
   money.

   Time moves from one goal date to the next, with a stop at least
   every 12 months. At each stop the policy picks a portfolio j (no
   riskier than the user's risk level) and wealth grows
       W' = max(0, W + s) * exp[(mu_j - sigma_j^2/2) dt + sigma_j sqrt(dt) Z]
   where s is the saving over those months and dt their length in
   years. When a goal comes due the policy takes it in full (pays
   the target amount), takes it in part (pays the smallest
   acceptable amount) or skips it, and keeps what is left for the
   goals after it.

   Reward: a goal's priority (1 to 5) in full, and that priority
   times smallest amount / target amount in part. PPO is trained to
   get the most expected reward (utility). A dynamic-programming
   solution of the same problem is the benchmark, and RL efficiency
   is utility / DP utility. The benchmark is quick, so it also
   answers the previews: the five risk levels side by side, and
   what-if changes.

   Shares the network, the PPO update and the fixed market paths
   with PpoPlanner; with one whole-year goal it is the same model.
   The same inputs always give the same result.
   Runs in a Web Worker (planner.worker.js), on the page, or in Node.
   ============================================================ */

(function (global) {
  "use strict";

  const PpoPlanner = typeof module !== "undefined" && module.exports
    ? require("./ppoPlanner")
    : global.PpoPlanner;

  /* the risk level rule and its message live in RiskPreference (src/riskPreference.js); looked up
  when a job is checked, since the page loads riskPreference.js after this file */
  const riskPreference = () => (typeof module !== "undefined" && module.exports ? require("./riskPreference") : global.RiskPreference);

  const { PORTFOLIOS, MAX_YEARS, EVAL_PATHS } = PpoPlanner;
  const {
    SEED, PATH_SEED, QUICK_PATHS, GAMMA, LAMBDA,
    mulberry32, gaussian, makeMLP, forward, makeAdam, cloneNet, ppoUpdate,
    maskedSoftmax, sample, argmax, normalNodes,
  } = PpoPlanner.core;

  /* Local names for the built-ins the inner loops use. Looking them up as globals each time is
     slow where the file runs in a sandbox, as the tests do; in a browser it makes no difference. */
  const { Float64Array, Uint8Array, Uint32Array } = globalThis;
  const { exp, log, sqrt, max, min, floor, round, ceil } = globalThis.Math;

  const J = PORTFOLIOS.length;
  const TAKE = J, PARTIAL = J + 1, SKIP = J + 2, N_ACT = J + 3;
  const MAX_GOALS = 20;
  const MIN_PRIORITY = 1, MAX_PRIORITY = 5;

  const N_OBS = 6;
  const HIDDEN = 24;
  const MAX_EPISODES = 64;    // trajectories per PPO update, fewer for long plans (see episodesFor)

  /* ---------- Environment ---------- */
  /* job: { netWorth, monthlySaving, maxRiskLevel = 5,
            goals: [{ id, targetAmount, months, priority = 3, minAcceptableAmount = 0 }] }
     with the goals in the API's shape plus `months`, the months until the target date. */
  function makeEnv({ netWorth, monthlySaving, goals, maxRiskLevel = J }) {
    const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
    if (!isNumber(netWorth)) throw new RangeError("Net worth must be a number.");
    if (!isNumber(monthlySaving)) throw new RangeError("Monthly saving must be a number.");
    const riskProblem = riskPreference().validate({ maxRiskLevel, esg: false }).maxRiskLevel;
    if (riskProblem) throw new RangeError(riskProblem);
    if (!Array.isArray(goals) || goals.length < 1 || goals.length > MAX_GOALS) {
      throw new RangeError(`The planner takes 1 to ${MAX_GOALS} goals.`);
    }

    const list = goals.map((goal, index) => {
      const { id, targetAmount, months, priority = 3, minAcceptableAmount = 0 } = goal || {};
      if (typeof id !== "string" && typeof id !== "number") throw new RangeError("Every goal needs an id.");
      if (!isNumber(targetAmount) || targetAmount <= 0) throw new RangeError("Goal amount must be more than $0.");
      if (!Number.isInteger(months) || months < 1) throw new RangeError("Months must be a whole number, at least 1.");
      if (months > MAX_YEARS * 12) throw new RangeError(`The planner covers goals up to ${MAX_YEARS} years away.`);
      if (!Number.isInteger(priority) || priority < MIN_PRIORITY || priority > MAX_PRIORITY) {
        throw new RangeError(`Choose a priority from ${MIN_PRIORITY} to ${MAX_PRIORITY}.`);
      }
      if (!isNumber(minAcceptableAmount) || minAcceptableAmount < 0 || minAcceptableAmount >= targetAmount) {
        throw new RangeError("The smallest amount you'd accept must be $0 or more and less than the goal amount.");
      }
      return { id, index, cost: targetAmount, min: minAcceptableAmount, priority, months };
    });
    if (new Set(list.map((g) => g.id)).size !== list.length) throw new RangeError("Two goals can't share an id.");

    /* rewards are shares of the total priority, so the best possible utility is 1 while training */
    const totalWeight = list.reduce((sum, g) => sum + g.priority, 0);
    for (const g of list) {
      g.full = g.priority / totalWeight;
      g.part = g.full * (g.min / g.cost);
    }

    /* stops: every goal date, and every 12 months until the last one */
    const lastMonth = max(...list.map((g) => g.months));
    const marks = new Set(list.map((g) => g.months));
    for (let m = 12; m < lastMonth; m += 12) marks.add(m);
    const stops = [0, ...[...marks].sort((a, b) => a - b)];

    /* one decision after another: invest for a step, then each goal due at its end, most important first */
    const steps = [], decisions = [];
    for (let k = 0; k + 1 < stops.length; k++) {
      const length = stops[k + 1] - stops[k], dt = length / 12;
      const step = {
        k, start: stops[k], end: stops[k + 1],
        save: monthlySaving * length,
        drift: PORTFOLIOS.map((p) => (p.mu - 0.5 * p.sigma * p.sigma) * dt),
        vol: PORTFOLIOS.map((p) => p.sigma * sqrt(dt)),
      };
      steps.push(step);
      decisions.push({ step, goal: null });
      list
        .filter((g) => g.months === step.end)
        .sort((a, b) => b.priority - a.priority || a.index - b.index)
        .forEach((goal) => decisions.push({ step, goal }));
    }

    return {
      W0: max(0, netWorth),
      goals: list, steps, decisions,
      cap: maxRiskLevel,                              // portfolios 0 .. cap - 1 can be used
      scale: max(...list.map((g) => g.cost)),    // wealth is measured against the largest goal
      totalWeight,
      months: lastMonth,
      years: ceil(lastMonth / 12),
    };
  }

  function grow(W, j, step, z) {
    return max(0, W + step.save) * exp(step.drift[j] + step.vol[j] * z);
  }

  /* what is left after a goal decision; an action the wealth can't pay for counts as a skip */
  const paysFull = (goal, action, W) => action === TAKE && W >= goal.cost;
  const paysPart = (goal, action, W) => action === PARTIAL && goal.min > 0 && W >= goal.min;
  function afterGoal(W, goal, action) {
    if (paysFull(goal, action, W)) return W - goal.cost;
    if (paysPart(goal, action, W)) return W - goal.min;
    return W;
  }

  /* ---------- Dynamic-programming benchmark ---------- */
  function solveDP(env) {
    /* Grid in log(W / scale); everything below the bottom is treated as ~zero wealth. With one
       goal this is PpoPlanner's grid. It reaches lower when a goal is tiny next to the largest. */
    const smallest = min(...env.goals.map((g) => (g.min > 0 ? g.min : g.cost)));
    const lo = max(-12, min(-7, floor(log(smallest / env.scale)) - 3));
    const hi = 4, dy = 11 / 400, N = round((hi - lo) / dy) + 1;
    const Wg = new Float64Array(N);
    for (let i = 0; i < N; i++) Wg[i] = env.scale * exp(lo + i * dy);
    const gh = normalNodes(33);
    const interp = (Vn, W) => {
      if (W <= Wg[0]) return Vn[0];
      const y = (log(W / env.scale) - lo) / dy;
      if (y >= N - 1) return Vn[N - 1];
      const i = floor(y), f = y - i;
      return Vn[i] * (1 - f) + Vn[i + 1] * f;
    };
    /* best of skip, full and part for one goal, given the value of the money left afterwards */
    const goalChoice = (goal, W, Vn) => {
      let value = interp(Vn, W), action = SKIP;
      if (W >= goal.cost) {
        const v = goal.full + interp(Vn, W - goal.cost);
        if (v > value + 1e-12) { value = v; action = TAKE; }
      }
      if (goal.min > 0 && W >= goal.min) {
        const v = goal.part + interp(Vn, W - goal.min);
        if (v > value + 1e-12) { value = v; action = PARTIAL; }
      }
      return { value, action };
    };

    const D = env.decisions.length;
    const after = new Array(D);     // after[d]: value of wealth once decision d is made
    const invest = new Array(D);    // invest[d]: best portfolio at each grid point
    let V = new Float64Array(N);    // nothing left to gain after the last decision
    for (let d = D - 1; d >= 0; d--) {
      const { step, goal } = env.decisions[d];
      const Vt = new Float64Array(N);
      after[d] = V;
      if (goal) {
        for (let i = 0; i < N; i++) Vt[i] = goalChoice(goal, Wg[i], V).value;
      } else {
        const Pt = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
          let best = -1, bj = 0;
          for (let j = 0; j < env.cap; j++) {
            let ev = 0;
            for (const [x, w] of gh) ev += w * interp(V, grow(Wg[i], j, step, x));
            if (ev > best + 1e-12) { best = ev; bj = j; }
          }
          Vt[i] = best; Pt[i] = bj;
        }
        invest[d] = Pt;
      }
      V = Vt;
    }

    return {
      invest(d, W) {
        if (W <= Wg[0]) return invest[d][0];
        const y = round((log(W / env.scale) - lo) / dy);
        return invest[d][min(N - 1, max(0, y))];
      },
      goal: (d, W) => goalChoice(env.decisions[d].goal, W, after[d]).action,
    };
  }

  /* ---------- Evaluate a policy on fixed market paths ---------- */
  const pathCache = {};
  function marketPaths(n, K) {
    const key = n + ":" + K;
    if (pathCache[key]) return pathCache[key];
    const rnd = mulberry32(PATH_SEED);
    const z = new Float64Array(n * K);
    for (let i = 0; i < z.length; i++) z[i] = gaussian(rnd);
    return (pathCache[key] = z);
  }

  /* policy: { invest(d, W) -> portfolio index, goal(d, W) -> TAKE, PARTIAL or SKIP } for decision d.
     Returns the utility and, per goal (in the job's order), how often it was reached in full or in
     part; with `withTimeline`, also the 10th/50th/90th percentile wealth at each stop, before and
     after that stop's goals are paid. */
  function evaluate(policy, env, n = EVAL_PATHS, withTimeline = false) {
    const K = env.steps.length, z = marketPaths(n, K);
    const full = new Uint32Array(env.goals.length), part = new Uint32Array(env.goals.length);
    const left = withTimeline ? env.steps.map(() => new Float64Array(n)) : null;
    const grown = withTimeline ? env.steps.map(() => new Float64Array(n)) : null;   // before the goals
    let reward = 0;
    for (let path = 0; path < n; path++) {
      let W = env.W0;
      for (let d = 0; d < env.decisions.length; d++) {
        const { step, goal } = env.decisions[d];
        if (!goal) {
          if (left && step.k > 0) left[step.k - 1][path] = W;
          W = grow(W, policy.invest(d, W), step, z[path * K + step.k]);
          if (grown) grown[step.k][path] = W;
          continue;
        }
        const action = policy.goal(d, W);
        if (paysFull(goal, action, W)) { full[goal.index]++; reward += goal.full; }
        else if (paysPart(goal, action, W)) { part[goal.index]++; reward += goal.part; }
        W = afterGoal(W, goal, action);
      }
      if (left) left[K - 1][path] = W;
    }
    const result = {
      utility: (reward / n) * env.totalWeight,
      goals: env.goals.map((g) => ({
        goalId: g.id,
        pFull: full[g.index] / n,
        pPartial: part[g.index] / n,
        pAny: (full[g.index] + part[g.index]) / n,
      })),
    };
    if (left) {
      const percentiles = (values) => {
        const sorted = values.sort();
        return { p10: sorted[floor(n * 0.1)], p50: sorted[floor(n * 0.5)], p90: sorted[floor(n * 0.9)] };
      };
      result.timeline = env.steps.map((step, k) => ({ month: step.end, ...percentiles(left[k]), before: percentiles(grown[k]) }));
    }
    return result;
  }

  /* The risk level (1 to 5) the policy holds at the start of each year, along the expected (Z = 0) path. */
  function riskLevelByYear(policy, env) {
    const levels = [];
    let W = env.W0;
    env.decisions.forEach(({ step, goal }, d) => {
      if (goal) { W = afterGoal(W, goal, policy.goal(d, W)); return; }
      const j = policy.invest(d, W);
      if (step.start % 12 === 0) levels.push(j + 1);
      W = grow(W, j, step, 0);
    });
    return levels;
  }

  /* ---------- PPO policy ---------- */
  /* Observation: how far through the plan, wealth against the largest goal and, at a goal decision,
     the goal's priority, the share its smallest amount is of the full one, and wealth against its cost. */
  function observe(d, W, env) {
    const goal = env.decisions[d].goal;
    const rel = (ref) => max(-6, min(3, log((max(W, 0) + ref * 1e-3) / ref))) / 3;
    return Float64Array.of(
      d / env.decisions.length,
      rel(env.scale),
      goal ? 1 : 0,
      goal ? goal.priority / MAX_PRIORITY : 0,
      goal ? goal.min / goal.cost : 0,
      goal ? rel(goal.cost) : 0,
    );
  }
  function validMask(d, W, env) {
    const goal = env.decisions[d].goal;
    const m = new Array(N_ACT).fill(false);
    if (!goal) { for (let j = 0; j < env.cap; j++) m[j] = true; return m; }
    m[SKIP] = true;
    if (W >= goal.cost) m[TAKE] = true;
    if (goal.min > 0 && W >= goal.min) m[PARTIAL] = true;
    return m;
  }
  /* a goal the wealth can't pay for even in part can only be skipped: nothing to decide or learn */
  const cantAfford = (goal, W) => goal && W < (goal.min > 0 ? goal.min : goal.cost);

  function greedyPolicy(pi, env) {
    const choose = (d, W) => argmax(maskedSoftmax(forward(pi, observe(d, W, env))[3], validMask(d, W, env)));
    return {
      invest: choose,
      goal: (d, W) => (cantAfford(env.decisions[d].goal, W) ? SKIP : choose(d, W)),
    };
  }

  /* ---------- Roll out trajectories with the current policy ---------- */
  function collect(pi, vf, env, rnd) {
    const buf = [], episodes = episodesFor(env.decisions.length);
    for (let e = 0; e < episodes; e++) {
      let W = env.W0;
      const ep = [];
      for (let d = 0; d < env.decisions.length; d++) {
        const { step, goal } = env.decisions[d];
        if (cantAfford(goal, W)) continue;
        const obs = observe(d, W, env), mask = validMask(d, W, env);
        const p = maskedSoftmax(forward(pi, obs)[3], mask);
        const a = sample(p, rnd);
        const v = forward(vf, obs)[3][0];
        let r = 0;
        if (!goal) W = grow(W, a, step, gaussian(rnd));
        else {
          if (a === TAKE) r = goal.full;
          else if (a === PARTIAL) r = goal.part;
          W = afterGoal(W, goal, a);
        }
        ep.push({ obs, mask, a, logp: log(p[a]), v, r });
      }
      /* GAE, terminal value 0 */
      let adv = 0;
      for (let i = ep.length - 1; i >= 0; i--) {
        const next = i + 1 < ep.length ? ep[i + 1].v : 0;
        const delta = ep[i].r + GAMMA * next - ep[i].v;
        adv = delta + GAMMA * LAMBDA * adv;
        ep[i].adv = adv;
        ep[i].ret = adv + ep[i].v;
      }
      buf.push(...ep);
    }
    return buf;
  }

  /* ---------- RL efficiency ---------- */
  /* Share of the DP benchmark's utility the PPO plan reaches, capped at 1 as in PpoPlanner;
     null when the benchmark can't reach any goal, so there is nothing to compare to. */
  function rlEfficiency(utility, dpUtility) {
    const ok = (u) => typeof u === "number" && Number.isFinite(u) && u >= 0;
    if (!ok(utility) || !ok(dpUtility)) throw new RangeError("Utility must be a number of 0 or more.");
    return dpUtility > 0 ? min(1, utility / dpUtility) : null;
  }

  /* ---------- Planning run ---------- */
  /* PPO rounds for a plan with `decisions` decisions: short plans are cheap per round, so they get more. */
  function iterationsFor(decisions) {
    return max(100, min(260, round(2400 / (decisions + 1))));
  }
  /* Trajectories per round: a long plan has more decisions in each, so it needs fewer to learn from. */
  function episodesFor(decisions) {
    return max(24, min(MAX_EPISODES, round(960 / decisions)));
  }

  /* Yields { type: "benchmark", dpUtility, goals } once, then { type: "progress", done, total,
     utility, goals } after every PPO round (utility and goals are null until the first check),
     and returns the plan. options.iterations and options.evalPaths are there to keep tests quick. */
  function* planSteps(job, options = {}) {
    const env = makeEnv(job);
    const evalPaths = options.evalPaths ?? EVAL_PATHS;
    const quickPaths = min(QUICK_PATHS, evalPaths);
    const rnd = mulberry32(SEED);

    /* DP first: it's quick, and it gives the benchmark the RL numbers are compared to. */
    const dp = evaluate(solveDP(env), env, evalPaths);
    yield { type: "benchmark", dpUtility: dp.utility, goals: dp.goals };

    const pi = makeMLP(N_OBS, N_ACT, rnd, 0.01, HIDDEN);
    const vf = makeMLP(N_OBS, 1, rnd, 1, HIDDEN);
    const optPi = makeAdam(pi), optV = makeAdam(vf);
    const iters = options.iterations ?? iterationsFor(env.decisions.length);

    let best = null, quick = null;
    for (let it = 1; it <= iters; it++) {
      const frac = it / iters;
      const buf = collect(pi, vf, env, rnd);
      ppoUpdate(pi, vf, optPi, optV, buf, rnd, 0.02 * (1 - frac), 1e-2 * (1 - 0.7 * frac));
      if (it % 10 === 0 || it === iters) {
        /* keep the best checkpoint seen so far (scored on a smaller set of paths) */
        quick = evaluate(greedyPolicy(pi, env), env, quickPaths);
        if (!best || quick.utility >= best.utility) best = { utility: quick.utility, pi: cloneNet(pi) };
      }
      yield { type: "progress", done: it, total: iters, utility: quick && quick.utility, goals: quick && quick.goals };
    }

    const policy = greedyPolicy(best.pi, env);
    const rl = evaluate(policy, env, evalPaths, true);
    return {
      maxRiskLevel: env.cap,
      utility: rl.utility,
      dpUtility: dp.utility,
      rlEfficiency: rlEfficiency(rl.utility, dp.utility),
      riskLevelByYear: riskLevelByYear(policy, env),
      goals: rl.goals,
      benchmarkGoals: dp.goals,
      timeline: rl.timeline,
      years: env.years,
      portfolios: PORTFOLIOS.map((p) => p.name),
    };
  }

  /* Runs the whole plan at once. onProgress, if given, gets each message planSteps yields. */
  function plan(job, options = {}) {
    const steps = planSteps(job, options);
    for (;;) {
      const next = steps.next();
      if (next.done) return next.value;
      if (options.onProgress) options.onProgress(next.value);
    }
  }

  /* ---------- Quick answers from the benchmark ---------- */
  /* The DP benchmark's plan for a job, with no training: the same numbers plan() reports as
     dpUtility and benchmarkGoals. Quick enough to run while a slider moves. */
  function estimate(job, options = {}) {
    const env = makeEnv(job);
    const policy = solveDP(env);
    const result = evaluate(policy, env, options.evalPaths ?? EVAL_PATHS);
    return {
      maxRiskLevel: env.cap,
      utility: result.utility,
      goals: result.goals,
      riskLevelByYear: riskLevelByYear(policy, env),
    };
  }

  /* The estimate at each of the five risk levels, lowest first, on the same market paths. */
  function compareRiskLevels(job, options = {}) {
    return PORTFOLIOS.map((p, j) => ({ ...estimate({ ...job, maxRiskLevel: j + 1 }, options), portfolio: p.name }));
  }

  /* How each goal's chance moves when part of the job changes, e.g. whatIf(job, { monthlySaving: 1200 }).
     `changes` replaces the job's fields; a goal that is only in one of the two has null for the other. */
  function whatIf(job, changes, options = {}) {
    const before = estimate(job, options);
    const after = estimate({ ...job, ...changes }, options);
    const chance = (plan, id) => {
      const goal = plan.goals.find((g) => g.goalId === id);
      return goal ? goal.pAny : null;
    };
    const ids = [...new Set([...before.goals, ...after.goals].map((g) => g.goalId))];
    return {
      before, after,
      utilityChange: after.utility - before.utility,
      goals: ids.map((goalId) => {
        const was = chance(before, goalId), now = chance(after, goalId);
        return { goalId, before: was, after: now, change: was === null || now === null ? null : now - was };
      }),
    };
  }

  const MultiGoalPlanner = {
    PORTFOLIOS, MAX_YEARS, MAX_GOALS, EVAL_PATHS,
    ACTIONS: Object.freeze({ full: TAKE, partial: PARTIAL, skip: SKIP }),
    plan, planSteps, estimate, compareRiskLevels, whatIf,
    rlEfficiency, makeEnv, solveDP, evaluate, riskLevelByYear, iterationsFor, episodesFor,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MultiGoalPlanner;
  else global.MultiGoalPlanner = MultiGoalPlanner;
})(typeof window !== "undefined" ? window : globalThis);
