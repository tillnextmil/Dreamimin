/* ============================================================
   COGNIFI MVP — Goal Probability Planner (runs in a Web Worker)

   Trains a PPO policy on the wealth model
       W(t+1) = max(0, W(t) + s) * exp[(mu_j - sigma_j^2/2) + sigma_j * Z]
   where s is yearly savings (income - expenses). State is (t, W(t)).
   Each year the policy picks a portfolio j; in the goal year it
   chooses to take the goal (reward U = 1, only if affordable) or skip.

   The expected reward of the trained policy is the probability of
   reaching the goal. A dynamic-programming solution of the same
   problem is the benchmark, and RL efficiency = P_rl / P_dp.
   Everything is in today's dollars (real returns).

   Loaded two ways: as a worker file, where it starts itself, and as a
   plain <script>, so the page can build a worker from cognifiPlanner
   when it is opened straight from disk (file:// blocks worker files).
   ============================================================ */

function cognifiPlanner(self) {
  "use strict";

  /* Five portfolios along one efficient frontier (real returns), same as the full site. */
  const PORTFOLIOS = [
    { name: "Cautious",     mu: 0.015, sigma: 0.05  },
    { name: "Conservative", mu: 0.025, sigma: 0.08  },
    { name: "Balanced",     mu: 0.037, sigma: 0.115 },
    { name: "Growth",       mu: 0.047, sigma: 0.15  },
    { name: "Aggressive",   mu: 0.057, sigma: 0.19  },
  ];
  const J = PORTFOLIOS.length;
  const TAKE = J, PARTIAL = J + 1, SKIP = J + 2, N_ACT = J + 3;

  const HIDDEN = 16;
  const EPISODES = 64;        // trajectories per PPO update
  const EPOCHS = 3;
  const MINIBATCH = 256;
  const CLIP = 0.2;
  const GAMMA = 1, LAMBDA = 0.95;
  const EVAL_PATHS = 4000;

  /* ---------- Seeded random numbers ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rnd) {
    const u = rnd() || 1e-12, v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---------- Tiny MLP (2 tanh layers) with manual backprop and Adam ---------- */
  function makeMLP(nIn, nOut, rnd, outScale) {
    const sizes = [nIn, HIDDEN, HIDDEN, nOut];
    const layers = [];
    for (let l = 0; l < 3; l++) {
      const a = sizes[l], b = sizes[l + 1];
      const scale = (l === 2 ? outScale : 1) * Math.sqrt(1 / a);
      const W = new Float64Array(a * b);
      for (let i = 0; i < W.length; i++) W[i] = gaussian(rnd) * scale;
      layers.push({ a, b, W, B: new Float64Array(b) });
    }
    return { sizes, layers };
  }

  function forward(net, x) {
    const acts = [x];
    let h = x;
    for (let l = 0; l < 3; l++) {
      const { a, b, W, B } = net.layers[l];
      const out = new Float64Array(b);
      for (let j = 0; j < b; j++) {
        let z = B[j];
        for (let i = 0; i < a; i++) z += h[i] * W[i * b + j];
        out[j] = l < 2 ? Math.tanh(z) : z;
      }
      acts.push(out);
      h = out;
    }
    return acts;
  }

  function zeroGrads(net) {
    return net.layers.map(L => ({ W: new Float64Array(L.W.length), B: new Float64Array(L.B.length) }));
  }

  /* Accumulate dLoss/dparams given dLoss/doutput for one sample. */
  function backward(net, acts, dOut, grads) {
    let d = dOut;
    for (let l = 2; l >= 0; l--) {
      const { a, b, W } = net.layers[l];
      const hIn = acts[l], g = grads[l];
      const dIn = new Float64Array(a);
      for (let j = 0; j < b; j++) {
        const dj = d[j];
        if (dj === 0) continue;
        g.B[j] += dj;
        for (let i = 0; i < a; i++) {
          g.W[i * b + j] += hIn[i] * dj;
          dIn[i] += W[i * b + j] * dj;
        }
      }
      if (l > 0) for (let i = 0; i < a; i++) dIn[i] *= 1 - hIn[i] * hIn[i];   // tanh'
      d = dIn;
    }
  }

  function makeAdam(net) {
    return { t: 0, m: zeroGrads(net), v: zeroGrads(net) };
  }
  function adamStep(net, opt, grads, lr, scale) {
    opt.t++;
    const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, opt.t), c2 = 1 - Math.pow(b2, opt.t);
    net.layers.forEach((L, l) => {
      for (const k of ["W", "B"]) {
        const p = L[k], g = grads[l][k], m = opt.m[l][k], v = opt.v[l][k];
        for (let i = 0; i < p.length; i++) {
          const gi = g[i] * scale;
          m[i] = b1 * m[i] + (1 - b1) * gi;
          v[i] = b2 * v[i] + (1 - b2) * gi * gi;
          p[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8);
        }
      }
    });
  }

  function cloneNet(net) {
    return { sizes: net.sizes, layers: net.layers.map(L => ({ a: L.a, b: L.b, W: Float64Array.from(L.W), B: Float64Array.from(L.B) })) };
  }
  function exportNet(net) {
    return net.layers.map(L => ({ a: L.a, b: L.b, W: Array.from(L.W), B: Array.from(L.B) }));
  }
  function importNet(saved) {
    return { sizes: [saved[0].a, saved[0].b, saved[1].b, saved[2].b], layers: saved.map(L => ({ a: L.a, b: L.b, W: Float64Array.from(L.W), B: Float64Array.from(L.B) })) };
  }

  /* ---------- Environment ---------- */
  /* Observation: time used, and log wealth relative to the goal's cost (scale-free). */
  function observe(t, W, env) {
    const x = Math.log((Math.max(W, 0) + env.C * 1e-3) / env.C);
    return Float64Array.of(t / env.T, Math.max(-6, Math.min(3, x)) / 3);
  }
  function validMask(t, W, env) {
    const m = new Array(N_ACT).fill(false);
    if (t < env.T) { for (let j = 0; j < J; j++) m[j] = true; }
    else { m[SKIP] = true; if (W >= env.C) m[TAKE] = true; }
    return m;
  }
  function step(W, j, env, z) {
    const p = PORTFOLIOS[j];
    return Math.max(0, W + env.s) * Math.exp(p.mu - 0.5 * p.sigma * p.sigma + p.sigma * z);
  }

  function maskedSoftmax(logits, mask) {
    let mx = -Infinity;
    for (let k = 0; k < N_ACT; k++) if (mask[k] && logits[k] > mx) mx = logits[k];
    const p = new Float64Array(N_ACT);
    let sum = 0;
    for (let k = 0; k < N_ACT; k++) if (mask[k]) { p[k] = Math.exp(logits[k] - mx); sum += p[k]; }
    for (let k = 0; k < N_ACT; k++) p[k] /= sum;
    return p;
  }
  function sample(p, rnd) {
    let u = rnd(), last = 0;
    for (let k = 0; k < N_ACT; k++) { if (p[k] > 0) { last = k; u -= p[k]; if (u <= 0) return k; } }
    return last;
  }
  function argmax(p) {
    let best = -1, bv = -Infinity;
    for (let k = 0; k < N_ACT; k++) if (p[k] > 0 && p[k] > bv) { bv = p[k]; best = k; }
    return best;
  }

  /* ---------- Roll out trajectories with the current policy ---------- */
  function collect(pi, vf, env, rnd) {
    const buf = [];
    for (let e = 0; e < EPISODES; e++) {
      let W = env.W0;
      const ep = [];
      for (let t = 0; t <= env.T; t++) {
        const obs = observe(t, W, env), mask = validMask(t, W, env);
        const p = maskedSoftmax(forward(pi, obs)[3], mask);
        const a = sample(p, rnd);
        const v = forward(vf, obs)[3][0];
        let r = 0;
        if (t < env.T) W = step(W, a, env, gaussian(rnd));
        else if (a === TAKE) r = env.U;
        ep.push({ obs, mask, a, logp: Math.log(p[a]), v, r });
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

  function ppoUpdate(pi, vf, optPi, optV, buf, rnd, entCoef, lr) {
    /* normalise advantages */
    let mean = 0, sq = 0;
    for (const x of buf) mean += x.adv;
    mean /= buf.length;
    for (const x of buf) sq += (x.adv - mean) ** 2;
    const std = Math.sqrt(sq / buf.length) + 1e-8;
    for (const x of buf) x.nadv = (x.adv - mean) / std;

    const idx = buf.map((_, i) => i);
    for (let ep = 0; ep < EPOCHS; ep++) {
      for (let i = idx.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [idx[i], idx[k]] = [idx[k], idx[i]]; }
      for (let start = 0; start < idx.length; start += MINIBATCH) {
        const batch = idx.slice(start, start + MINIBATCH);
        const gPi = zeroGrads(pi), gV = zeroGrads(vf);
        for (const bi of batch) {
          const x = buf[bi];
          /* policy: clipped surrogate + entropy bonus */
          const actsP = forward(pi, x.obs);
          const p = maskedSoftmax(actsP[3], x.mask);
          const ratio = Math.exp(Math.log(p[x.a]) - x.logp);
          const A = x.nadv;
          const clipped = (A > 0 && ratio > 1 + CLIP) || (A < 0 && ratio < 1 - CLIP);
          const dLogp = clipped ? 0 : -ratio * A;
          let H = 0;
          for (let k = 0; k < N_ACT; k++) if (p[k] > 0) H -= p[k] * Math.log(p[k]);
          const dLogit = new Float64Array(N_ACT);
          for (let k = 0; k < N_ACT; k++) {
            if (!x.mask[k]) continue;
            dLogit[k] = dLogp * ((k === x.a ? 1 : 0) - p[k]);
            if (p[k] > 0) dLogit[k] += entCoef * p[k] * (Math.log(p[k]) + H);
          }
          backward(pi, actsP, dLogit, gPi);
          /* value: squared error to the GAE return */
          const actsV = forward(vf, x.obs);
          backward(vf, actsV, Float64Array.of(actsV[3][0] - x.ret), gV);
        }
        adamStep(pi, optPi, gPi, lr, 1 / batch.length);
        adamStep(vf, optV, gV, lr, 1 / batch.length);
      }
    }
  }

  /* ---------- Evaluate a policy on fixed market paths ---------- */
  const pathCache = {};
  function marketPaths(n, T) {
    const key = n + ":" + T;
    if (pathCache[key]) return pathCache[key];
    const rnd = mulberry32(20261021);
    const z = new Float64Array(n * T);
    for (let i = 0; i < z.length; i++) z[i] = gaussian(rnd);
    return (pathCache[key] = z);
  }

  /* choose(t, W) -> portfolio index. Returns P(goal reached) and the median path's portfolios. */
  function evaluate(choose, env, n) {
    const z = marketPaths(n, env.T);
    let hits = 0;
    const finals = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      let W = env.W0;
      for (let t = 0; t < env.T; t++) W = step(W, choose(t, W), env, z[k * env.T + t]);
      finals[k] = W;
      if (W >= env.C) hits++;
    }
    const sorted = Array.from(finals).sort((a, b) => a - b);
    return { prob: hits / n, p10: sorted[Math.floor(n * 0.1)], p50: sorted[Math.floor(n * 0.5)], p90: sorted[Math.floor(n * 0.9)] };
  }

  function greedyChooser(pi, env) {
    return (t, W) => {
      const p = maskedSoftmax(forward(pi, observe(t, W, env))[3], validMask(t, W, env));
      return argmax(p);
    };
  }

  /* What the policy does along the expected (Z = 0) path: one portfolio per year. */
  function glidePath(choose, env) {
    const out = [];
    let W = env.W0;
    for (let t = 0; t < env.T; t++) { const j = choose(t, W); out.push(j); W = step(W, j, env, 0); }
    return out;
  }

  /* ---------- Dynamic-programming benchmark ---------- */
  function solveDP(env) {
    /* Grid in log(W / C); everything below the bottom is treated as ~zero wealth. */
    const N = 401, lo = -7, hi = 4, dy = (hi - lo) / (N - 1);
    const Wg = new Float64Array(N);
    for (let i = 0; i < N; i++) Wg[i] = env.C * Math.exp(lo + i * dy);
    const gh = normalNodes(33);
    let V = new Float64Array(N);
    for (let i = 0; i < N; i++) V[i] = Wg[i] >= env.C ? env.U : 0;
    const policy = [];
    const interp = (Vn, W) => {
      if (W <= Wg[0]) return Vn[0];
      const y = (Math.log(W / env.C) - lo) / dy;
      if (y >= N - 1) return Vn[N - 1];
      const i = Math.floor(y), f = y - i;
      return Vn[i] * (1 - f) + Vn[i + 1] * f;
    };
    for (let t = env.T - 1; t >= 0; t--) {
      const Vt = new Float64Array(N), Pt = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        let best = -1, bj = 0;
        for (let j = 0; j < J; j++) {
          let ev = 0;
          for (const [x, w] of gh) ev += w * interp(V, step(Wg[i], j, env, x));
          if (ev > best + 1e-12) { best = ev; bj = j; }
        }
        Vt[i] = best; Pt[i] = bj;
      }
      policy[t] = Pt; V = Vt;
    }
    const choose = (t, W) => {
      if (W <= Wg[0]) return policy[t][0];
      const y = Math.round((Math.log(W / env.C) - lo) / dy);
      return policy[t][Math.min(N - 1, Math.max(0, y))];
    };
    return { choose };
  }

  /* Quadrature for E[f(Z)], Z ~ N(0,1): normal weights on an even grid over [-4, 4]. */
  function normalNodes(n) {
    const nodes = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = -4 + (8 * i) / (n - 1), w = Math.exp(-0.5 * x * x);
      nodes.push([x, w]); sum += w;
    }
    return nodes.map(([x, w]) => [x, w / sum]);
  }

  /* Multi-goal jobs use goals: [{ id, name, cost, years, partial, importance }],
     where years is due-in-years and importance is an integer from 1 to 5.
     The PPO shares wealth across goals; the DP benchmark optimizes the same
     full/partial/skip decisions and reports odds at each risk cap. */
  /* ---------- Multi-goal planner ---------- */
  function normalizeMultiGoalJob(job) {
    if (!job || !Array.isArray(job.goals) || job.goals.length === 0 || job.goals.length > 20)
      throw new RangeError("A multi-goal plan needs between 1 and 20 goals.");
    if (![job.netWorth, job.income, job.expenses].every(Number.isFinite) || job.income < 0 || job.expenses < 0)
      throw new RangeError("Net worth, income, and expenses must be finite; income and expenses cannot be negative.");
    const goals = job.goals.map((goal, i) => {
      if (!goal || typeof goal !== "object" || !Number.isFinite(goal.cost) || goal.cost <= 0)
        throw new RangeError(`Goal ${i + 1} needs a positive finite cost.`);
      const years = goal.years;
      if (!Number.isInteger(years) || years < 1 || years > 40)
        throw new RangeError(`Goal ${i + 1} must be due in 1 to 40 years.`);
      const partial = goal.partial === undefined ? 0 : goal.partial;
      const importance = goal.importance === undefined ? (goal.priority === undefined ? 3 : goal.priority) : goal.importance;
      if (!Number.isFinite(partial) || partial < 0 || partial >= goal.cost)
        throw new RangeError(`Goal ${i + 1}'s partial amount must be zero or less than its full cost.`);
      if (!Number.isInteger(importance) || importance < 1 || importance > 5)
        throw new RangeError(`Goal ${i + 1}'s importance must be an integer from 1 to 5.`);
      return {
        id: goal.id === undefined ? `goal-${i + 1}` : String(goal.id),
        name: typeof goal.name === "string" && goal.name.trim() ? goal.name.trim() : `Goal ${i + 1}`,
        cost: goal.cost,
        years,
        partial,
        importance,
        index: i,
      };
    });
    if (new Set(goals.map((goal) => goal.id)).size !== goals.length)
      throw new RangeError("Goal IDs must be unique.");
    const years = Math.max(...goals.map((goal) => goal.years));
    const cap = job.riskTolerance === undefined ? J - 1 : job.riskTolerance;
    if (!Number.isInteger(cap) || cap < 0 || cap >= J)
      throw new RangeError("Risk tolerance must be an integer from 0 to 4.");
    return {
      W0: Math.max(0, job.netWorth),
      s: 12 * (job.income - job.expenses),
      T: years,
      cap,
      goals: goals.sort((a, b) => a.years - b.years || b.importance - a.importance || a.index - b.index),
      scale: Math.max(1, ...goals.map((goal) => goal.cost), Math.max(0, job.netWorth), Math.max(0, 12 * (job.income - job.expenses) * years)),
    };
  }

  function multiObservation(t, wealth, env, goal) {
    const scale = goal ? goal.cost : env.scale;
    const relative = Math.log((Math.max(wealth, 0) + scale * 1e-3) / scale);
    return Float64Array.of(
      t / env.T,
      Math.max(-6, Math.min(3, relative)) / 3,
      goal ? goal.importance / 5 : 0,
      goal ? goal.partial / goal.cost : 0,
      goal ? 1 : 0
    );
  }

  function multiMask(wealth, goal, cap = J - 1) {
    const mask = new Array(N_ACT).fill(false);
    if (!goal) {
      for (let j = 0; j <= cap; j++) mask[j] = true;
    } else {
      mask[SKIP] = true;
      if (wealth >= goal.cost) mask[TAKE] = true;
      if (goal.partial > 0 && wealth >= goal.partial) mask[PARTIAL] = true;
    }
    return mask;
  }

  function gridValue(values, wealth, scale, lo, dy) {
    if (wealth <= 0) return values[0];
    const y = (Math.log(wealth / scale) - lo) / dy;
    if (y <= 0) return values[0];
    if (y >= values.length - 1) return values[values.length - 1];
    const i = Math.floor(y), f = y - i;
    return values[i] * (1 - f) + values[i + 1] * f;
  }

  function gridAction(actions, wealth, scale, lo, dy) {
    const y = wealth <= 0 ? 0 : Math.round((Math.log(wealth / scale) - lo) / dy);
    return actions[Math.min(actions.length - 1, Math.max(0, y))];
  }

  function solveMultiDP(env, cap) {
    const N = 401, lo = -8, hi = 4, dy = (hi - lo) / (N - 1);
    const wealthGrid = new Float64Array(N);
    for (let i = 0; i < N; i++) wealthGrid[i] = env.scale * Math.exp(lo + i * dy);
    const quadrature = normalNodes(33);
    const goalsByYear = Array.from({ length: env.T + 1 }, () => []);
    env.goals.forEach((goal) => goalsByYear[goal.years].push(goal));
    const goalPolicies = new Map();
    const afterGoals = new Array(env.T + 1);
    let future = new Float64Array(N);

    for (let year = env.T; year >= 1; year--) {
      let value = future;
      for (const goal of goalsByYear[year].slice().reverse()) {
        const choices = new Uint8Array(N);
        const current = new Float64Array(N);
        for (let i = 0; i < N; i++) {
          const wealth = wealthGrid[i];
          let best = gridValue(value, wealth, env.scale, lo, dy);
          let action = SKIP;
          if (wealth >= goal.cost) {
            const fullValue = goal.importance + gridValue(value, wealth - goal.cost, env.scale, lo, dy);
            if (fullValue > best + 1e-12) { best = fullValue; action = TAKE; }
          }
          if (goal.partial > 0 && wealth >= goal.partial) {
            const partValue = goal.importance * goal.partial / goal.cost + gridValue(value, wealth - goal.partial, env.scale, lo, dy);
            if (partValue > best + 1e-12) { best = partValue; action = PARTIAL; }
          }
          current[i] = best;
          choices[i] = action;
        }
        goalPolicies.set(goal.id, choices);
        value = current;
      }
      afterGoals[year] = value;
      future = value;
    }

    const riskPolicies = new Array(env.T);
    let startValues = future;
    for (let year = env.T - 1; year >= 0; year--) {
      const continuation = afterGoals[year + 1] || startValues;
      const current = new Float64Array(N);
      const choices = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        let best = -Infinity, bestRisk = 0;
        for (let risk = 0; risk <= cap; risk++) {
          const portfolio = PORTFOLIOS[risk];
          const mu = portfolio.mu, sigma = portfolio.sigma;
          const invested = Math.max(0, wealthGrid[i] + env.s);
          let expected = 0;
          for (const [z, weight] of quadrature) {
            const nextWealth = invested * Math.exp(mu - 0.5 * sigma * sigma + sigma * z);
            expected += weight * gridValue(continuation, nextWealth, env.scale, lo, dy);
          }
          if (expected > best + 1e-12) { best = expected; bestRisk = risk; }
        }
        current[i] = best;
        choices[i] = bestRisk;
      }
      riskPolicies[year] = choices;
      startValues = current;
    }
    return {
      chooseRisk: (year, wealth) => gridAction(riskPolicies[year], wealth, env.scale, lo, dy),
      chooseGoal: (goal, wealth) => gridAction(goalPolicies.get(goal.id), wealth, env.scale, lo, dy),
      expectedUtility: gridValue(startValues, env.W0, env.scale, lo, dy),
    };
  }

  function evaluateMulti(choose, env, paths) {
    const shocks = marketPaths(paths, env.T);
    const full = new Uint32Array(env.goals.length), partial = new Uint32Array(env.goals.length);
    const goalsByYear = Array.from({ length: env.T + 1 }, () => []);
    env.goals.forEach((goal) => goalsByYear[goal.years].push(goal));
    let utility = 0;
    for (let path = 0; path < paths; path++) {
      let wealth = env.W0;
      const offset = path * env.T;
      for (let year = 0; year < env.T; year++) {
        const risk = choose.risk(year, wealth);
        wealth = step(wealth, risk, env, shocks[offset + year]);
        for (const goal of goalsByYear[year + 1]) {
          const action = choose.goal(goal, wealth);
          if (action === TAKE && wealth >= goal.cost) {
            wealth -= goal.cost;
            full[goal.index]++;
            utility += goal.importance;
          } else if (action === PARTIAL && goal.partial > 0 && wealth >= goal.partial) {
            wealth -= goal.partial;
            partial[goal.index]++;
            utility += goal.importance * goal.partial / goal.cost;
          }
        }
      }
    }
    const goalResults = env.goals.map((goal) => {
      const pFull = full[goal.index] / paths;
      const pPartial = partial[goal.index] / paths;
      const pAny = pFull + pPartial;
      return {
        id: goal.id, name: goal.name, pFull, pPartial, pAny,
        verdict: pAny >= 0.8 ? "Realistic" : pAny >= 0.5 ? "Within reach" : pAny >= 0.2 ? "A stretch" : "Not realistic yet",
      };
    });
    return { goals: goalResults, utility: utility / paths };
  }

  function dpChooser(solution) {
    return { risk: solution.chooseRisk, goal: solution.chooseGoal };
  }

  function collectMulti(pi, vf, env, rnd) {
    const buffer = [];
    for (let episode = 0; episode < EPISODES; episode++) {
      let wealth = env.W0;
      const rollout = [];
      for (let year = 0; year < env.T; year++) {
        const investmentObs = multiObservation(year, wealth, env, null);
        const investmentMask = multiMask(wealth, null, env.cap);
        const investmentP = maskedSoftmax(forward(pi, investmentObs)[3], investmentMask);
        const investmentAction = sample(investmentP, rnd);
        const investmentV = forward(vf, investmentObs)[3][0];
        wealth = step(wealth, investmentAction, env, gaussian(rnd));
        rollout.push({ obs: investmentObs, mask: investmentMask, a: investmentAction, logp: Math.log(investmentP[investmentAction]), v: investmentV, r: 0 });

        for (const goal of env.goals) {
          if (goal.years !== year + 1) continue;
          const goalObs = multiObservation(year + 1, wealth, env, goal);
          const goalMask = multiMask(wealth, goal, env.cap);
          const goalP = maskedSoftmax(forward(pi, goalObs)[3], goalMask);
          const goalAction = sample(goalP, rnd);
          const goalV = forward(vf, goalObs)[3][0];
          let reward = 0;
          if (goalAction === TAKE) {
            wealth -= goal.cost;
            reward = goal.importance;
          } else if (goalAction === PARTIAL) {
            wealth -= goal.partial;
            reward = goal.importance * goal.partial / goal.cost;
          }
          rollout.push({ obs: goalObs, mask: goalMask, a: goalAction, logp: Math.log(goalP[goalAction]), v: goalV, r: reward });
        }
      }
      let advantage = 0;
      for (let i = rollout.length - 1; i >= 0; i--) {
        const nextValue = i + 1 < rollout.length ? rollout[i + 1].v : 0;
        const delta = rollout[i].r + GAMMA * nextValue - rollout[i].v;
        advantage = delta + GAMMA * LAMBDA * advantage;
        rollout[i].adv = advantage;
        rollout[i].ret = advantage + rollout[i].v;
      }
      buffer.push(...rollout);
    }
    return buffer;
  }

  function multiChooser(pi, env) {
    return {
      risk(year, wealth) {
        const obs = multiObservation(year, wealth, env, null);
        return argmax(maskedSoftmax(forward(pi, obs)[3], multiMask(wealth, null, env.cap)));
      },
      goal(goal, wealth) {
        const obs = multiObservation(goal.years, wealth, env, goal);
        return argmax(maskedSoftmax(forward(pi, obs)[3], multiMask(wealth, goal, env.cap)));
      },
    };
  }

  function planMultiGoal(job, warm, progress, options = {}) {
    const env = normalizeMultiGoalJob(job);
    const iterations = options.iterations === undefined
      ? Math.max(100, Math.min(300, Math.round(1800 / (env.T + env.goals.length))))
      : options.iterations;
    if (!Number.isInteger(iterations) || iterations < 0) throw new RangeError("Training iterations must be a non-negative integer.");
    const paths = options.paths === undefined ? EVAL_PATHS : options.paths;
    if (!Number.isInteger(paths) || paths < 1) throw new RangeError("Evaluation paths must be a positive integer.");
    const rnd = mulberry32(options.seed === undefined ? 187 : options.seed);
    const dp = solveMultiDP(env, env.cap);
    const dpResult = evaluateMulti(dpChooser(dp), env, paths);
    const riskComparison = PORTFOLIOS.map((portfolio, risk) => {
      const solution = solveMultiDP(env, risk);
      const comparison = evaluateMulti(dpChooser(solution), env, Math.min(paths, 1000));
      return { risk, name: portfolio.name, utility: comparison.utility, goals: comparison.goals };
    });
    const pi = warm && warm.mode === "multi" ? importNet(warm.pi) : makeMLP(5, N_ACT, rnd, 0.01);
    const vf = warm && warm.mode === "multi" ? importNet(warm.vf) : makeMLP(5, 1, rnd, 1);
    const optPi = makeAdam(pi), optV = makeAdam(vf);
    let best = null;
    for (let it = 1; it <= iterations; it++) {
      const frac = it / iterations;
      const buffer = collectMulti(pi, vf, env, rnd);
      ppoUpdate(pi, vf, optPi, optV, buffer, rnd, 0.02 * (1 - frac), 1e-2 * (1 - 0.7 * frac));
      if (it % 10 === 0 || it === iterations) {
        const quick = evaluateMulti(multiChooser(pi, env), env, Math.min(paths, 500)).utility;
        if (!best || quick >= best.quick) best = { quick, pi: cloneNet(pi) };
        if (progress) progress({ done: it, total: iterations, utility: quick });
      }
    }
    if (!best) best = { quick: 0, pi: cloneNet(pi) };
    const rlResult = evaluateMulti(multiChooser(best.pi, env), env, paths);
    const chooser = multiChooser(best.pi, env);
    const glide = [];
    let wealth = env.W0;
    for (let year = 0; year < env.T; year++) {
      const risk = chooser.risk(year, wealth);
      glide.push(risk);
      wealth = step(wealth, risk, env, 0);
      for (const goal of env.goals) {
        if (goal.years !== year + 1) continue;
        const action = chooser.goal(goal, wealth);
        if (action === TAKE && wealth >= goal.cost) wealth -= goal.cost;
        else if (action === PARTIAL && wealth >= goal.partial) wealth -= goal.partial;
      }
    }
    return {
      mode: "multi",
      riskTolerance: env.cap,
      utility: rlResult.utility,
      dpUtility: dpResult.utility,
      rlEfficiency: dpResult.utility > 0
        ? Math.min(1, rlResult.utility / dpResult.utility)
        : rlResult.utility === 0 ? 1 : 0,
      goals: rlResult.goals,
      dpGoals: dpResult.goals,
      riskComparison,
      portfolios: PORTFOLIOS.map((portfolio) => portfolio.name),
      glide,
      weights: { mode: "multi", pi: exportNet(best.pi), vf: exportNet(vf) },
    };
  }

  /* ---------- Job ---------- */
  self.onmessage = (ev) => {
    const { job, warm } = ev.data;
    if (Array.isArray(job.goals)) {
      const result = planMultiGoal(job, warm, (progress) => self.postMessage({ type: "progress", ...progress }));
      self.postMessage({ type: "result", ...result });
      return;
    }
    const env = { W0: Math.max(0, job.netWorth), s: 12 * (job.income - job.expenses), C: job.cost, T: job.years, U: 1 };
    const rnd = mulberry32(187);

    /* DP first: it's quick, and it gives the benchmark the RL number is compared to. */
    const dp = solveDP(env);
    const dpEval = evaluate(dp.choose, env, EVAL_PATHS);
    self.postMessage({ type: "benchmark", dp: dpEval.prob });

    const legacyWarm = warm && warm.mode !== "multi" ? warm : null;
    const pi = legacyWarm ? importNet(legacyWarm.pi) : makeMLP(2, N_ACT, rnd, 0.01);
    const vf = legacyWarm ? importNet(legacyWarm.vf) : makeMLP(2, 1, rnd, 1);
    const optPi = makeAdam(pi), optV = makeAdam(vf);
    /* short horizons are cheap per round, so they get more rounds; a warm start needs fewer */
    const full = Math.max(150, Math.min(400, Math.round(3200 / (env.T + 1))));
    const iters = warm ? Math.round(full * 0.4) : full;

    let best = null;
    for (let it = 1; it <= iters; it++) {
      const frac = it / iters;
      const buf = collect(pi, vf, env, rnd);
      ppoUpdate(pi, vf, optPi, optV, buf, rnd, 0.02 * (1 - frac), 1e-2 * (1 - 0.7 * frac));
      if (it % 10 === 0 || it === iters) {
        /* keep the best checkpoint seen so far (scored on a smaller set of paths) */
        const quick = evaluate(greedyChooser(pi, env), env, 1000).prob;
        if (!best || quick >= best.quick) best = { quick, pi: cloneNet(pi) };
        self.postMessage({ type: "progress", done: it, total: iters, prob: quick });
      }
    }

    const choose = greedyChooser(best.pi, env);
    const rl = evaluate(choose, env, EVAL_PATHS);
    self.postMessage({
      type: "result",
      prob: rl.prob,
      dp: dpEval.prob,
      p10: rl.p10, p50: rl.p50, p90: rl.p90,
      glide: glidePath(choose, env),
      portfolios: PORTFOLIOS.map(p => p.name),
      weights: { pi: exportNet(best.pi), vf: exportNet(vf) },
    });
  };

  return {
    normalizeMultiGoalJob, solveMultiDP, evaluateMulti, dpChooser, planMultiGoal,
    actions: { full: TAKE, partial: PARTIAL, skip: SKIP },
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = cognifiPlanner;
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) cognifiPlanner(self);
