/* ============================================================
   PpoPlanner — the goal probability planner.

   Trains a PPO policy on the wealth model
       W(t+1) = max(0, W(t) + s) * exp[(mu_j - sigma_j^2/2) + sigma_j * Z]
   where s is yearly savings. State is (t, W(t)). Each year the
   policy picks a portfolio j; in the goal year it chooses to take
   the goal (reward U = 1, only if affordable) or skip.

   The expected reward of the trained policy is the probability of
   reaching the goal. A dynamic-programming solution of the same
   problem is the benchmark, and RL efficiency = P_rl / P_dp.
   Everything is in today's dollars (real returns).

   Every run starts from the same seed and never from an earlier
   policy, so the same inputs always give the same result.
   Runs in a Web Worker (planner.worker.js), on the page, or in Node.
   ============================================================ */

(function (global) {
  "use strict";

  /* Five portfolios along one efficient frontier (real returns). */
  const PORTFOLIOS = [
    { name: "Cautious",     mu: 0.015, sigma: 0.05  },
    { name: "Conservative", mu: 0.025, sigma: 0.08  },
    { name: "Balanced",     mu: 0.037, sigma: 0.115 },
    { name: "Growth",       mu: 0.047, sigma: 0.15  },
    { name: "Aggressive",   mu: 0.057, sigma: 0.19  },
  ];
  const J = PORTFOLIOS.length;
  const TAKE = J, SKIP = J + 1, N_ACT = J + 2;

  const MAX_YEARS = 40;
  const SEED = 187;           // training randomness
  const PATH_SEED = 20261021; // the fixed market paths every policy is scored on

  const HIDDEN = 16;
  const EPISODES = 64;        // trajectories per PPO update
  const EPOCHS = 3;
  const MINIBATCH = 256;
  const CLIP = 0.2;
  const GAMMA = 1, LAMBDA = 0.95;
  const EVAL_PATHS = 4000;
  const QUICK_PATHS = 1000;

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

  /* ---------- Environment ---------- */
  /* A goal `months` away becomes ceil(months / 12) yearly steps. The yearly
     saving is spread so the total put away is still monthlySaving * months. */
  function makeEnv({ netWorth, monthlySaving, cost, months }) {
    const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
    if (!isNumber(netWorth)) throw new RangeError("Net worth must be a number.");
    if (!isNumber(monthlySaving)) throw new RangeError("Monthly saving must be a number.");
    if (!isNumber(cost) || cost <= 0) throw new RangeError("Goal cost must be more than $0.");
    if (!Number.isInteger(months) || months < 1) throw new RangeError("Months must be a whole number, at least 1.");
    const T = Math.ceil(months / 12);
    if (T > MAX_YEARS) throw new RangeError(`The planner covers goals up to ${MAX_YEARS} years away.`);
    return { W0: Math.max(0, netWorth), s: (monthlySaving * months) / T, C: cost, T, U: 1 };
  }

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
    const rnd = mulberry32(PATH_SEED);
    const z = new Float64Array(n * T);
    for (let i = 0; i < z.length; i++) z[i] = gaussian(rnd);
    return (pathCache[key] = z);
  }

  /* choose(t, W) -> portfolio index. Returns P(goal reached) and the 10th/50th/90th percentile final wealth. */
  function evaluate(choose, env, n = EVAL_PATHS) {
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

  /* ---------- RL efficiency ---------- */
  /* Share of the DP benchmark's probability the RL planner reaches, between 0 and 1.
     Capped at 1, since on a finite set of paths RL can edge past the grid-based DP.
     null when the benchmark itself can't reach the goal, so there is nothing to compare to. */
  function rlEfficiency(rlProb, dpProb) {
    const isProb = (p) => typeof p === "number" && p >= 0 && p <= 1;
    if (!isProb(rlProb) || !isProb(dpProb)) throw new RangeError("Probabilities must be between 0 and 1.");
    return dpProb > 0 ? Math.min(1, rlProb / dpProb) : null;
  }

  /* ---------- Planning run ---------- */
  /* PPO rounds for a horizon: short horizons are cheap per round, so they get more. */
  function iterationsFor(T) {
    return Math.max(150, Math.min(400, Math.round(3200 / (T + 1))));
  }

  /* Yields { type: "benchmark", dp } once, then { type: "progress", done, total, prob }
     after every PPO round, and returns the result. Driving it one step at a time
     lets the page keep responding when it has to run without a worker.
     options.iterations and options.evalPaths are there to keep tests quick. */
  function* planSteps(job, options = {}) {
    const env = makeEnv(job);
    const evalPaths = options.evalPaths ?? EVAL_PATHS;
    const quickPaths = Math.min(QUICK_PATHS, evalPaths);
    const rnd = mulberry32(SEED);

    /* DP first: it's quick, and it gives the benchmark the RL number is compared to. */
    const dp = evaluate(solveDP(env).choose, env, evalPaths);
    yield { type: "benchmark", dp: dp.prob };

    const pi = makeMLP(2, N_ACT, rnd, 0.01);
    const vf = makeMLP(2, 1, rnd, 1);
    const optPi = makeAdam(pi), optV = makeAdam(vf);
    const iters = options.iterations ?? iterationsFor(env.T);

    let best = null, quick = null;
    for (let it = 1; it <= iters; it++) {
      const frac = it / iters;
      const buf = collect(pi, vf, env, rnd);
      ppoUpdate(pi, vf, optPi, optV, buf, rnd, 0.02 * (1 - frac), 1e-2 * (1 - 0.7 * frac));
      if (it % 10 === 0 || it === iters) {
        /* keep the best checkpoint seen so far (scored on a smaller set of paths) */
        quick = evaluate(greedyChooser(pi, env), env, quickPaths).prob;
        if (!best || quick >= best.quick) best = { quick, pi: cloneNet(pi) };
      }
      yield { type: "progress", done: it, total: iters, prob: quick };
    }

    const choose = greedyChooser(best.pi, env);
    const rl = evaluate(choose, env, evalPaths);
    return {
      prob: rl.prob,
      dp: dp.prob,
      efficiency: rlEfficiency(rl.prob, dp.prob),
      p10: rl.p10, p50: rl.p50, p90: rl.p90,
      years: env.T,
      glide: glidePath(choose, env),
      portfolios: PORTFOLIOS.map(p => p.name),
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

  const PpoPlanner = {
    PORTFOLIOS, MAX_YEARS, EVAL_PATHS,
    plan, planSteps, rlEfficiency, makeEnv, solveDP, evaluate, glidePath, iterationsFor, mulberry32,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = PpoPlanner;
  else global.PpoPlanner = PpoPlanner;
})(typeof window !== "undefined" ? window : globalThis);
