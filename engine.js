/* ============================================================
   COGNIFI — planning engine
   Everything is in today's dollars, using after-inflation
   (real) returns, so a goal's cost means what it says.

   - solve():         pooled multi-goal dynamic program: for every year
                      and balance, which goals to pay (full / smaller /
                      skip) and which risk level to hold.
   - simulateGoals(): Monte Carlo of that policy over the wealth model
                      W(t+1) = W(t) * exp[(mu - sigma^2/2) + sigma*Z].
   - optimize():      the best risk cap within the user's tolerance.
   - retirement():    year-by-year withdrawals across traditional,
                      Roth and taxable accounts, with an optional annuity.
   ============================================================ */

(function (global) {
  "use strict";

  const BASE_YEAR = new Date().getFullYear();
  const MAX_YEARS = 60;
  const FULL_PATHS = 4000;    // used for the figures we show

  /* Five portfolios along one efficient frontier (real returns). */
  const RISK = [
    { key: "cautious",     name: "Cautious",     mu: 0.015, sigma: 0.05,  mix: { stocks: 20,  bonds: 60, cash: 20 } },
    { key: "conservative", name: "Conservative", mu: 0.025, sigma: 0.08,  mix: { stocks: 40,  bonds: 50, cash: 10 } },
    { key: "balanced",     name: "Balanced",     mu: 0.037, sigma: 0.115, mix: { stocks: 60,  bonds: 35, cash: 5  } },
    { key: "growth",       name: "Growth",       mu: 0.047, sigma: 0.15,  mix: { stocks: 80,  bonds: 18, cash: 2  } },
    { key: "aggressive",   name: "Aggressive",   mu: 0.057, sigma: 0.19,  mix: { stocks: 100, bonds: 0,  cash: 0  } },
  ];
  /* ESG screening narrows the fund universe: slightly lower return, slightly more swing. */
  const ESG_MU = -0.003, ESG_SIGMA = 0.005;

  function portfolio(level, esg) {
    const r = RISK[level];
    return { mu: r.mu + (esg ? ESG_MU : 0), sigma: r.sigma + (esg ? ESG_SIGMA : 0) };
  }

  /* ---------- Seeded random numbers, so figures hold still between edits ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const shockCache = {};
  function shocks(paths) {
    if (shockCache[paths]) return shockCache[paths];
    const rnd = mulberry32(20261006 + paths);
    const z = new Float64Array(paths * MAX_YEARS);
    for (let i = 0; i < z.length; i += 2) {
      const u = rnd() || 1e-12, v = rnd();
      const r = Math.sqrt(-2 * Math.log(u));
      z[i] = r * Math.cos(2 * Math.PI * v);
      if (i + 1 < z.length) z[i + 1] = r * Math.sin(2 * Math.PI * v);
    }
    return (shockCache[paths] = z);
  }

  /* Growth factors exp(drift + sigma Z) per level, cached: the inner loop becomes a multiply. */
  const growthCache = {};
  function growth(paths, level, esg) {
    const key = paths + ":" + level + ":" + (esg ? 1 : 0);
    if (growthCache[key]) return growthCache[key];
    const z = shocks(paths);
    const { mu, sigma } = portfolio(level, esg);
    const drift = mu - 0.5 * sigma * sigma;
    const g = new Float64Array(z.length);
    for (let i = 0; i < z.length; i++) g[i] = Math.exp(drift + sigma * z[i]);
    return (growthCache[key] = g);
  }

  function percentile(sorted, p) {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
  }

  /* ============================================================
     Pooled multi-goal dynamic program (Das, Ostrov, Radhakrishnan &
     Srivastav, "Dynamic Optimization for Multi-Goals Wealth Management").
     All the money sits in one portfolio. Working backward from the last
     goal, for every year t and every wealth W on a log-spaced grid, it picks
       - for each goal due at t: the full goal, the smaller version or
         neither, whichever maximises u + V(W - c) among what W can afford;
       - the risk level (up to the cap) that maximises E[V(t+1)] after this
         year's savings go in and a year of W * exp[(mu - sigma^2/2) + sigma*Z].
     V(t, W) is the best expected importance-weighted total still to come,
     so whether a goal is paid depends on the money there when it comes due.

     spec.w0        starting wealth
     spec.savings   set aside each year until retirement
     spec.retireIdx year index when savings stop (Infinity if none)
     spec.goals     [{ idx, cost, partial, importance, at }]
                    at: share of this year that passes before a goal due this
                    year, so the savings made by then count toward it
     spec.cash      Float64Array of one-off cash in (+) / out (-) by year
     spec.cap       highest risk level allowed
     spec.allow     optional, per goal: 0 never, 1 full or smaller (default),
                    2 smaller only, 3 full only
     spec.esg, spec.paths, spec.fan
     ============================================================ */

  /* One year's transition, as in Das & Ostrov: next year's value is averaged over every grid
     point the wealth could land on, not a handful of sample points (those miss the jump where
     a goal becomes affordable). In grid steps, log-wealth moves by m + sZ (m = drift/dx,
     s = sigma/dx), so for V interpolated linearly between grid points
       E[V] = sum_j V[j] * kappa(j - x - m),  kappa(e) = E[hat(e - sZ)],  hat(u) = max(0, 1 - |u|).
     kappa is tabulated once per level and grid spacing. */
  const KRES = 16, kernelCache = new Map();
  function kernel(mu, sigma, dx) {
    const key = mu + ":" + sigma + ":" + dx;
    if (kernelCache.has(key)) return kernelCache.get(key);
    const m = (mu - 0.5 * sigma * sigma) / dx, s = sigma / dx, half = Math.ceil(5 * s + 1);
    const tab = new Float64Array(2 * half * KRES + 1), M = 64, h = 2 / M;
    for (let a = 0; a < tab.length; a++) {
      const e = -half + a / KRES;
      let sum = 0;   // Simpson's rule over the hat's support, u in [-1, 1]
      for (let r = 0; r <= M; r++) {
        const u = -1 + r * h, z = (e - u) / s;
        sum += (1 - Math.abs(u)) * Math.exp(-0.5 * z * z) * (r === 0 || r === M ? 1 : r % 2 ? 4 : 2);
      }
      tab[a] = (sum * h) / 3 / (s * Math.sqrt(2 * Math.PI));
    }
    const out = { m, half, tab };
    kernelCache.set(key, out);
    return out;
  }

  const PER_SIGMA = 3;         // wealth grid points per yearly sigma of the calmest level (Das & Ostrov use at least 3)
  const MAX_GRID = 1500;
  const LEVEL_PATHS = 2000;    // used for the other risk levels we show

  /* which goals can be paid when, and the money that comes in around them */
  function schedule(spec) {
    const goals = spec.goals, allow = spec.allow || goals.map(() => 1);
    const T = Math.min(MAX_YEARS, goals.reduce((m, g, i) => (allow[i] && g.idx >= 0 ? Math.max(m, g.idx) : m), 0));
    const S = Math.max(0, spec.savings || 0), R = spec.retireIdx, cash = spec.cash;
    const s0 = R > 0 ? S : 0;
    const steps = Array.from({ length: T + 1 }, () => []);
    goals.forEach((g, i) => {
      if (!allow[i] || g.idx < 0 || g.idx > T) return;
      const opts = [];
      const hasPart = g.partial > 0 && g.partial < g.cost;
      if (allow[i] !== 2) opts.push({ kind: 1, c: g.cost, u: g.importance });
      if (allow[i] !== 3 && hasPart) opts.push({ kind: 2, c: g.partial, u: g.importance * (g.partial / g.cost) });
      if (opts.length) steps[g.idx].push({ i, at: g.idx === 0 ? Math.min(0.99, Math.max(0, g.at || 0)) : 0, imp: g.importance, opts, pre: 0 });
    });
    steps.forEach((st) => st.sort((a, b) => a.at - b.at || b.imp - a.imp));
    /* this year's savings arrive month by month, so a goal later this year can use some of them */
    let prev = 0;
    steps[0].forEach((s) => { s.pre = s0 * (s.at - prev); prev = s.at; });
    const inflow = new Float64Array(T);
    for (let t = 0; t < T; t++) inflow[t] = (t < R ? S : 0) - (t === 0 ? s0 * prev : 0) + (t > 0 && cash ? cash[t] : 0);
    const start = (spec.w0 || 0) + (cash ? cash[0] : 0);
    return { T, steps, inflow, start };
  }

  const dpCache = new Map();
  function solve(spec) {
    const key = JSON.stringify([spec.w0, spec.savings, spec.retireIdx, spec.cash ? Array.from(spec.cash) : 0,
      spec.goals, spec.allow || 0, spec.cap, spec.esg ? 1 : 0]);
    if (dpCache.has(key)) return dpCache.get(key);
    const { T, steps, inflow, start } = schedule(spec);
    const cap = spec.cap, lv = [];
    for (let L = 0; L <= cap; L++) lv.push(portfolio(L, spec.esg));

    /* wealth grid: from a sliver of the cheapest goal up to every dollar in at the boldest
       level's mean plus three sigmas (the W_max of Das & Ostrov) */
    let minC = Infinity, needAll = 0;
    steps.forEach((st) => st.forEach((s) => { s.opts.forEach((o) => (minC = Math.min(minC, o.c))); needAll += s.opts[0].c; }));
    if (!isFinite(minC)) minC = Math.max(1, start);
    const top = lv[cap], drift = top.mu - 0.5 * top.sigma * top.sigma;
    const amounts = [Math.max(0, start) + steps[0].reduce((a, s) => a + s.pre, 0)];
    for (let t = 0; t < T; t++) amounts.push(Math.max(0, inflow[t]));
    let wHi = amounts[0];
    for (let tau = 1; tau <= T; tau++) {
      let w = 0;
      for (let t = 0; t < tau; t++) { const y = tau - t; w += (t === 0 ? amounts[0] + amounts[1] : amounts[t + 1]) * Math.exp(drift * y + 3 * top.sigma * Math.sqrt(y)); }
      wHi = Math.max(wHi, w);
    }
    let lo = Math.log(Math.max(1, minC / 1000));
    const hi = Math.log(Math.max(wHi, 2 * needAll, 10 * Math.exp(lo)));
    let dx = lv[0].sigma / PER_SIGMA;
    if ((hi - lo) / dx + 1 > MAX_GRID) dx = (hi - lo) / (MAX_GRID - 1);
    /* shift the grid down so today's wealth sits exactly on a grid point, as Das & Ostrov do */
    if (start > Math.exp(lo)) lo -= dx - ((Math.log(start) - lo) % dx || dx);
    const N = Math.ceil((hi - lo) / dx) + 1;
    const W = new Float64Array(N);
    for (let k = 0; k < N; k++) W[k] = Math.exp(lo + k * dx);

    const atIdx = (V, x) => {
      if (x <= 0) return V[0];
      if (x >= N - 1) return V[N - 1];
      const k = x | 0, f = x - k;
      return V[k] + (V[k + 1] - V[k]) * f;
    };
    const at = (V, w) => (w <= W[0] ? V[0] : atIdx(V, (Math.log(w) - lo) / dx));
    const kern = lv.map(({ mu, sigma }) => kernel(mu, sigma, dx));
    /* E[V(next)] for wealth at fractional grid index x, a year at level L */
    const expect = (V, x, L) => {
      const { m, half, tab } = kern[L], c = x + m;
      let ev = 0, wsum = 0;
      for (let j = Math.ceil(c - half), j1 = Math.floor(c + half); j <= j1; j++) {
        const a = (j - c + half) * KRES, a0 = a | 0, wt = tab[a0] + (tab[Math.min(a0 + 1, tab.length - 1)] - tab[a0]) * (a - a0);
        ev += wt * V[j < 0 ? 0 : j >= N ? N - 1 : j]; wsum += wt;
      }
      return ev / wsum;
    };

    const pol = new Array(T), H = new Array(T + 1);
    const eps = 1e-7 * (1 + spec.goals.reduce((a, g) => a + g.importance, 0));
    let Vnext = null;
    for (let t = T; t >= 0; t--) {
      /* Q: value once this year's goals are settled, before saving and investing.
         Nothing is left to buy after the last goal, so it is worth zero there. */
      const Q = new Float64Array(N);
      if (t < T) {
        const choice = new Uint8Array(N), add = inflow[t];
        for (let k = 0; k < N; k++) {
          const w = W[k] + add;
          if (w <= W[0]) { Q[k] = Vnext[0]; continue; }
          const x = (Math.log(w) - lo) / dx;
          let best = -1, bestL = 0;
          for (let L = 0; L <= cap; L++) {
            const ev = expect(Vnext, x, L);
            if (ev > best + eps) { best = ev; bestL = L; }   // ties go to less risk
          }
          Q[k] = best; choice[k] = bestL;
        }
        pol[t] = choice;
      }
      /* goals due at t, one at a time: take the full goal, the smaller one or neither */
      const st = steps[t], Hs = new Array(st.length + 1);
      Hs[st.length] = Q;
      for (let m = st.length - 1; m >= 0; m--) {
        const nxt = Hs[m + 1], cur = new Float64Array(N), s = st[m];
        for (let k = 0; k < N; k++) {
          const w = W[k] + s.pre, skip = at(nxt, w);
          /* a grid point stands for the half-step of wealth either side of it; only the part
             of that span at or above the cost can pay, which puts the jump where it belongs */
          const span = (dx * W[k]) / w;
          let best = skip;
          for (const o of s.opts) {
            const f = Math.min(1, Math.max(0, (Math.log(w / o.c)) / span + 0.5));
            if (f > 0) best = Math.max(best, skip + f * Math.max(0, o.u + at(nxt, Math.max(0, w - o.c)) - skip));
          }
          cur[k] = best;
        }
        Hs[m] = cur;
      }
      H[t] = Hs; Vnext = Hs[0];
    }

    const out = {
      T, steps, inflow, start, H, at, eps,
      v0: at(H[0][0], Math.max(0, start)),
      level: (t, w) => pol[t][w <= W[0] ? 0 : Math.min(N - 1, Math.max(0, Math.round((Math.log(w) - lo) / dx)))],
    };
    if (dpCache.size >= 24) dpCache.delete(dpCache.keys().next().value);
    dpCache.set(key, out);
    return out;
  }

  /* simulateGoals(spec): run the dynamic program's policy through simulated markets */
  function simulateGoals(spec) {
    const sol = solve(spec), P = spec.paths || FULL_PATHS, cap = spec.cap;
    const goals = spec.goals, n = goals.length, T = sol.T;
    const G = RISK.map((_, L) => (L <= cap ? growth(P, L, spec.esg) : null));
    const full = new Float64Array(n), part = new Float64Array(n), stocks = new Float64Array(T);
    let util = 0, maxUtil = 0;
    goals.forEach((g) => (maxUtil += g.importance));
    const fan = spec.fan ? Array.from({ length: T + 1 }, () => new Float64Array(P)) : null;
    let level0 = null;

    for (let p = 0; p < P; p++) {
      let w = Math.max(0, sol.start);
      const base = p * MAX_YEARS;
      for (let t = 0; t <= T; t++) {
        const st = sol.steps[t], Hs = sol.H[t];
        if (fan) fan[t][p] = w + st.reduce((a, s) => a + s.pre, 0);   // money on hand for this year's goals
        for (let m = 0; m < st.length; m++) {
          const s = st[m], nxt = Hs[m + 1];
          w += s.pre;
          let best = sol.at(nxt, w) - sol.eps, pick = null;   // a near-tie goes to paying for the goal
          for (const o of s.opts) {
            if (w < o.c) continue;
            const v = o.u + sol.at(nxt, w - o.c);
            if (v > best) { best = v; pick = o; }
          }
          if (pick) { w -= pick.c; util += pick.u; if (pick.kind === 1) full[s.i]++; else part[s.i]++; }
        }
        if (t === T) break;
        const L = sol.level(t, w);
        if (p === 0 && t === 0) level0 = L;
        stocks[t] += RISK[L].mix.stocks;
        w = Math.max(0, w + sol.inflow[t]) * G[L][base + t];
      }
    }

    const L0 = level0 === null ? 0 : level0;
    const res = {
      pFull: Array.from(full, (v) => v / P),
      pPart: Array.from(part, (v) => v / P),
      util: util / P,
      share: maxUtil > 0 ? util / P / maxUtil : 0,
      glide: Array.from(stocks, (v) => v / P),   // average share in stocks, year by year
      level0: L0, mixNow: { ...RISK[L0].mix }, muNow: portfolio(L0, spec.esg).mu,
      v0: sol.v0, cap,
    };
    if (fan) {
      res.fan = { p10: [], p50: [], p90: [] };
      for (let k = 0; k <= T; k++) {
        const col = fan[k].sort();
        res.fan.p10.push(percentile(col, 0.1));
        res.fan.p50.push(percentile(col, 0.5));
        res.fan.p90.push(percentile(col, 0.9));
      }
    }
    return res;
  }

  /* What the plan mostly does with each goal: 1 full, 2 the smaller version, 0 set aside. */
  function labels(res) {
    return res.pFull.map((f, i) => {
      const q = res.pPart[i];
      return f + q < 0.01 ? 0 : q > f ? 2 : 1;
    });
  }

  /* ============================================================
     optimize(base, tolerance)
     The dynamic program already decides every goal for every
     balance, so what's left is the risk cap. It is solved with the
     cap at each level; the best cap within the user's tolerance
     wins, preferring less risk unless more clearly pays.
     ============================================================ */
  function optimize(base, tolerance) {
    const v0 = RISK.map((_, C) => solve({ ...base, cap: C }).v0);
    const pick = (maxL, edge) => {
      let best = 0;
      for (let L = 1; L <= maxL; L++) if (v0[L] > v0[best] * edge + 1e-9) best = L;
      return best;
    };
    const level = pick(tolerance, 1.004);
    /* what we suggest: more risk only when it clearly pays (2% more of what you care about) */
    const idealLevel = pick(RISK.length - 1, 1.02);
    const byLevel = RISK.map((_, L) => simulateGoals({ ...base, cap: L, paths: L === level ? FULL_PATHS : LEVEL_PATHS, fan: true }));
    const result = byLevel[level];
    return { level, decisions: labels(result), result, idealLevel, byLevel };
  }

  /* Best odds of one goal in full, pursued on its own (everything else skipped), risk capped at `cap`. */
  function standalone(base, i, cap) {
    const allow = base.goals.map((_, j) => (j === i ? 3 : 0));
    return simulateGoals({ ...base, allow, cap, paths: 1500 }).pFull[i];
  }

  /* ============================================================
     Retirement: 2026 federal brackets, single filer (simplified)
     ============================================================ */
  const STD_DEDUCTION = 16100;
  const BRACKETS = [
    [12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24],
    [256225, 0.32], [640600, 0.35], [Infinity, 0.37],
  ];
  const CAP_GAINS = 0.15, GAINS_ZERO_TOP = 49450, GAIN_SHARE = 0.5, HEIR_RATE = 0.24, RMD_AGE = 75;
  const FILL = { "10%": STD_DEDUCTION + 12400, "12%": STD_DEDUCTION + 50400, "22%": STD_DEDUCTION + 105700 };

  function ordinaryTax(gross) {
    let taxable = Math.max(0, gross - STD_DEDUCTION), tax = 0, prev = 0;
    for (const [top, rate] of BRACKETS) {
      if (taxable <= prev) break;
      tax += (Math.min(taxable, top) - prev) * rate;
      prev = top;
    }
    return tax;
  }

  /* gains sit on top of ordinary income: 0% up to the threshold, 15% above (20% tier ignored) */
  function totalTax(ordinary, gains) {
    const unusedDeduction = Math.max(0, STD_DEDUCTION - ordinary);
    const taxableGains = Math.max(0, gains - unusedDeduction);
    const ordTaxable = Math.max(0, ordinary - STD_DEDUCTION);
    const zeroRoom = Math.max(0, GAINS_ZERO_TOP - ordTaxable);
    return ordinaryTax(ordinary) + CAP_GAINS * Math.max(0, taxableGains - zeroRoom);
  }

  /* required minimum distribution divisor: IRS Uniform Lifetime Table (2022 onward), ages 72 to 120 */
  const UNIFORM_LIFETIME = [
    27.4, 26.5, 25.5, 24.6, 23.7, 22.9, 22.0, 21.1, 20.2, 19.4, 18.5, 17.7, 16.8, 16.0, 15.2, 14.4, 13.7,
    12.9, 12.2, 11.5, 10.8, 10.1, 9.5, 8.9, 8.4, 7.8, 7.3, 6.8, 6.4, 6.0, 5.6, 5.2, 4.9, 4.6, 4.3, 4.1,
    3.9, 3.7, 3.5, 3.4, 3.3, 3.1, 3.0, 2.9, 2.8, 2.7, 2.5, 2.3, 2.0,
  ];
  const rmdDivisor = (age) => UNIFORM_LIFETIME[Math.min(UNIFORM_LIFETIME.length - 1, Math.max(0, age - 72))];

  /* An annuity bought with after-tax money returns that money tax-free, a little each year:
     cost / expected return multiple (IRS Publication 939, Table V), until the cost is recovered. */
  const TABLE_V = [[50, 33.1], [55, 28.6], [60, 24.2], [65, 20.0], [70, 16.0], [75, 12.5], [80, 9.5], [85, 6.9], [90, 5.0]];
  function lifeMultiple(age) {
    if (age <= TABLE_V[0][0]) return TABLE_V[0][1];
    for (let k = 1; k < TABLE_V.length; k++) {
      const [a1, m1] = TABLE_V[k], [a0, m0] = TABLE_V[k - 1];
      if (age <= a1) return m0 + ((m1 - m0) * (age - a0)) / (a1 - a0);
    }
    return TABLE_V[TABLE_V.length - 1][1];
  }

  function annuityRate(age) { return Math.min(0.08, Math.max(0.035, 0.05 + 0.0015 * (age - 65))); }

  /* One retirement, year by year.
     strat = { kind: "conventional" }  taxable, then traditional, then Roth
           | { kind: "fill", bracket, convert }  traditional up to a bracket, then taxable, Roth, rest of traditional */
  function drawdown(start, o, strat, spend) {
    let tr = start.trad, ro = start.roth, tx = start.taxable;
    const A = start.annuityIncome, r = o.drawReturn;
    const fillTop = strat.kind === "fill" ? FILL[strat.bracket] : 0;
    const rows = [];
    let taxSum = 0, ranOutAge = null, basisLeft = start.annuityBasis;

    for (let age = o.retireAge; age < o.lifeExp; age++) {
      const forced = age >= RMD_AGE ? Math.min(tr, tr / rmdDivisor(age)) : 0;
      tr -= forced;
      /* the annuity's tax-free part, until what was paid in with after-tax money comes back */
      const excluded = Math.min(basisLeft, start.annuityExclusion, A);
      basisLeft -= excluded;
      const cashIn = A + forced, baseIncome = cashIn - excluded;   // baseIncome: the taxable part

      const tranches = strat.kind === "fill"
        ? (() => { const first = Math.min(tr, Math.max(0, fillTop - baseIncome)); return [["t", first], ["x", tx], ["r", ro], ["t", tr - first]]; })()
        : [["x", tx], ["t", tr], ["r", ro]];
      const cap = tranches.reduce((s, q) => s + q[1], 0);

      const alloc = (x) => {
        const a = { t: 0, x: 0, r: 0 };
        for (const [src, c] of tranches) { const take = Math.min(c, x); a[src] += take; x -= take; if (x <= 0) break; }
        return a;
      };
      const evaluate = (a) => {
        const tax = totalTax(baseIncome + a.t, GAIN_SHARE * a.x);
        return { net: cashIn + a.t + a.x + a.r - tax, tax };
      };

      let a, ev;
      const all = alloc(cap), evAll = evaluate(all);
      if (evAll.net < spend - 0.5) {
        a = all; ev = evAll;
        if (ranOutAge === null) ranOutAge = age;
      } else {
        let lo = 0, hi = cap;
        for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (evaluate(alloc(mid)).net < spend) lo = mid; else hi = mid; }
        a = alloc(hi); ev = evaluate(a);
      }

      tr -= a.t; tx -= a.x; ro -= a.r;
      let tax = ev.tax, converted = 0;
      if (ev.net > spend) tx += ev.net - spend;   // surplus (an RMD or annuity beyond what's spent) is reinvested

      /* once spending is covered, fill the rest of the bracket with a Roth conversion */
      if (strat.kind === "fill" && strat.convert && tr > 0) {
        const room = fillTop - (baseIncome + a.t);
        if (room > 0) {
          converted = Math.min(room, tr);
          const ctax = totalTax(baseIncome + a.t + converted, GAIN_SHARE * a.x) - ev.tax;
          tr -= converted; ro += converted - ctax; tax += ctax;
        }
      }
      taxSum += tax;
      rows.push({ age, trad: a.t + forced, rmd: forced, taxable: a.x, roth: a.r, annuity: A, tax, converted, spent: Math.min(ev.net, spend), endTrad: tr, endRoth: ro, endTaxable: tx });

      tr = Math.max(0, tr) * (1 + r); ro = Math.max(0, ro) * (1 + r); tx = Math.max(0, tx) * (1 + r);
    }
    return { rows, totalTax: taxSum, ranOutAge, legacy: tx + ro + tr * (1 - HEIR_RATE) };
  }

  const STRATEGIES = [
    { kind: "conventional" },
    ...["10%", "12%", "22%"].flatMap((bracket) => [{ kind: "fill", bracket, convert: false }, { kind: "fill", bracket, convert: true }]),
  ];

  function retirement(o) {
    /* grow today's balances (plus yearly contributions) to the retirement date */
    const years = Math.max(0, o.retireAge - o.age);
    let trad = o.trad, roth = o.roth, taxable = o.taxable;
    for (let y = 0; y < years; y++) {
      trad = (trad + o.cTrad) * (1 + o.accReturn);
      roth = (roth + o.cRoth) * (1 + o.accReturn);
      taxable = (taxable + o.cTaxable) * (1 + o.accReturn);
    }
    const atRetirement = { trad, roth, taxable };

    /* an annuity is bought from the traditional account first, then taxable */
    let annuityIncome = 0, annuityCost = 0, annuityBasis = 0, annuityExclusion = 0;
    if (o.annuityOn && o.annuityAmt > 0) {
      annuityCost = Math.min(o.annuityAmt, trad + taxable);
      const fromTrad = Math.min(trad, annuityCost);
      trad -= fromTrad; taxable -= annuityCost - fromTrad;
      annuityIncome = annuityCost * annuityRate(o.retireAge);
      /* payments bought with pre-tax (traditional) money are fully taxed; the taxable-account
         part was already taxed, so its share of each payment is partly a tax-free return of cost */
      annuityBasis = annuityCost - fromTrad;
      annuityExclusion = annuityBasis > 0 ? Math.min(annuityBasis * annuityRate(o.retireAge), annuityBasis / lifeMultiple(o.retireAge)) : 0;
    }
    const start = { trad, roth, taxable, annuityIncome, annuityBasis, annuityExclusion };

    const maxSpend = (strategy) => {
      let lo = 0, hi = 400000;
      for (let k = 0; k < 32; k++) {
        const mid = (lo + hi) / 2;
        if (drawdown(start, o, strategy, mid).ranOutAge === null) lo = mid; else hi = mid;
      }
      return lo;
    };

    /* try every strategy; keep the one that best serves the chosen aim */
    const conv = STRATEGIES[0];
    let best, spend, spendConv, efficient, conventional;
    if (o.mode === "income") {
      const scored = STRATEGIES.map((s) => ({ s, spend: maxSpend(s) }));
      best = scored.reduce((b, x) => (x.spend > b.spend + 1 ? x : b));
      spend = best.spend; spendConv = scored[0].spend;
      efficient = drawdown(start, o, best.s, spend);
      conventional = drawdown(start, o, conv, spendConv);
    } else {
      spend = spendConv = o.spending;
      const scored = STRATEGIES.map((s) => ({ s, run: drawdown(start, o, s, spend) }));
      const score = (x) => (x.run.ranOutAge === null ? 1e12 + x.run.legacy : x.run.ranOutAge);
      best = scored.reduce((b, x) => (score(x) > score(b) + 1 ? x : b));
      efficient = best.run; conventional = scored[0].run;
    }

    return {
      atRetirement, annuityIncome, annuityCost, annuityRate: annuityRate(o.retireAge),
      spend, spendConv, efficient, conventional, strategy: best.s,
      fillTop: best.s.kind === "fill" ? FILL[best.s.bracket] : 0, rmdAge: RMD_AGE,
    };
  }

  global.Engine = {
    BASE_YEAR, MAX_YEARS, RISK, ESG_MU, FULL_PATHS,
    portfolio, solve, simulateGoals, optimize, standalone, retirement, ordinaryTax, annuityRate,
  };
})(window);
