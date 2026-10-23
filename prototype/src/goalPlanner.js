/* ============================================================
   GoalPlanner — runs GoalSolver's policy through simulated markets
   and picks the risk cap.
   - simulate():   Monte Carlo of the policy over Market's wealth model.
   - optimize():   the best risk cap within the user's tolerance.
   - standalone(): one goal's best odds on its own.
   ============================================================ */

(function (global) {
  "use strict";

  const Market = typeof require === "function" ? require("./market") : global.Market;
  const GoalSolver = typeof require === "function" ? require("./goalSolver") : global.GoalSolver;

  class GoalPlanner {
    static FULL_PATHS = 4000;    // used for the figures we show
    static LEVEL_PATHS = 2000;   // used for the other risk levels we show

    /* run the dynamic program's policy through simulated markets */
    static simulate(spec) {
      const sol = GoalSolver.solve(spec), P = spec.paths || GoalPlanner.FULL_PATHS, cap = spec.cap;
      const goals = spec.goals, n = goals.length, T = sol.T;
      const G = Market.RISK.map((_, L) => (L <= cap ? Market.growth(P, L, spec.esg) : null));
      const full = new Float64Array(n), part = new Float64Array(n), stocks = new Float64Array(T);
      let util = 0, maxUtil = 0;
      goals.forEach((g) => (maxUtil += g.importance));
      const fan = spec.fan ? Array.from({ length: T + 1 }, () => new Float64Array(P)) : null;
      let level0 = null;

      for (let p = 0; p < P; p++) {
        let w = Math.max(0, sol.start);
        const base = p * Market.MAX_YEARS;
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
          stocks[t] += Market.RISK[L].mix.stocks;
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
        level0: L0, mixNow: { ...Market.RISK[L0].mix }, muNow: Market.portfolio(L0, spec.esg).mu,
        v0: sol.v0, cap,
      };
      if (fan) {
        res.fan = { p10: [], p50: [], p90: [] };
        for (let k = 0; k <= T; k++) {
          const col = fan[k].sort();
          res.fan.p10.push(Market.percentile(col, 0.1));
          res.fan.p50.push(Market.percentile(col, 0.5));
          res.fan.p90.push(Market.percentile(col, 0.9));
        }
      }
      return res;
    }

    /* What the plan mostly does with each goal: 1 full, 2 the smaller version, 0 set aside. */
    static labels(res) {
      return res.pFull.map((f, i) => {
        const q = res.pPart[i];
        return f + q < 0.01 ? 0 : q > f ? 2 : 1;
      });
    }

    /* The dynamic program already decides every goal for every
       balance, so what's left is the risk cap. It is solved with the
       cap at each level; the best cap within the user's tolerance
       wins, preferring less risk unless more clearly pays. */
    static optimize(base, tolerance) {
      const v0 = Market.RISK.map((_, C) => GoalSolver.solve({ ...base, cap: C }).v0);
      const pick = (maxL, edge) => {
        let best = 0;
        for (let L = 1; L <= maxL; L++) if (v0[L] > v0[best] * edge + 1e-9) best = L;
        return best;
      };
      const level = pick(tolerance, 1.004);
      /* what we suggest: more risk only when it clearly pays (2% more of what you care about) */
      const idealLevel = pick(Market.RISK.length - 1, 1.02);
      const byLevel = Market.RISK.map((_, L) => GoalPlanner.simulate({ ...base, cap: L, paths: L === level ? GoalPlanner.FULL_PATHS : GoalPlanner.LEVEL_PATHS, fan: true }));
      const result = byLevel[level];
      return { level, decisions: GoalPlanner.labels(result), result, idealLevel, byLevel };
    }

    /* Best odds of one goal in full, pursued on its own (everything else skipped), risk capped at `cap`. */
    static standalone(base, i, cap) {
      const allow = base.goals.map((_, j) => (j === i ? 3 : 0));
      return GoalPlanner.simulate({ ...base, allow, cap, paths: 1500 }).pFull[i];
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = GoalPlanner;
  else global.GoalPlanner = GoalPlanner;
})(typeof window !== "undefined" ? window : globalThis);
