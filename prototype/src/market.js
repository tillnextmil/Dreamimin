/* ============================================================
   Market — the five risk levels and the simulated markets.
   Everything is in today's dollars, using after-inflation
   (real) returns. Wealth model:
     W(t+1) = W(t) * exp[(mu - sigma^2/2) + sigma*Z]
   ============================================================ */

(function (global) {
  "use strict";

  /* seeded shocks and growth factors, cached so figures hold still between edits */
  const shockCache = {};
  const growthCache = {};

  class Market {
    static BASE_YEAR = new Date().getFullYear();
    static MAX_YEARS = 60;

    /* Five portfolios along one efficient frontier (real returns). */
    static RISK = [
      { key: "cautious",     name: "Cautious",     mu: 0.015, sigma: 0.05,  mix: { stocks: 20,  bonds: 60, cash: 20 } },
      { key: "conservative", name: "Conservative", mu: 0.025, sigma: 0.08,  mix: { stocks: 40,  bonds: 50, cash: 10 } },
      { key: "balanced",     name: "Balanced",     mu: 0.037, sigma: 0.115, mix: { stocks: 60,  bonds: 35, cash: 5  } },
      { key: "growth",       name: "Growth",       mu: 0.047, sigma: 0.15,  mix: { stocks: 80,  bonds: 18, cash: 2  } },
      { key: "aggressive",   name: "Aggressive",   mu: 0.057, sigma: 0.19,  mix: { stocks: 100, bonds: 0,  cash: 0  } },
    ];

    /* ESG screening narrows the fund universe: slightly lower return, slightly more swing. */
    static ESG_MU = -0.003;
    static ESG_SIGMA = 0.005;

    /* expected real return and yearly swing of risk level `level` */
    static portfolio(level, esg) {
      const r = Market.RISK[level];
      return { mu: r.mu + (esg ? Market.ESG_MU : 0), sigma: r.sigma + (esg ? Market.ESG_SIGMA : 0) };
    }

    /* Seeded random numbers in [0, 1). */
    static mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /* standard normal shocks Z, MAX_YEARS per path (Box–Muller) */
    static shocks(paths) {
      if (shockCache[paths]) return shockCache[paths];
      const rnd = Market.mulberry32(20261006 + paths);
      const z = new Float64Array(paths * Market.MAX_YEARS);
      for (let i = 0; i < z.length; i += 2) {
        const u = rnd() || 1e-12, v = rnd();
        const r = Math.sqrt(-2 * Math.log(u));
        z[i] = r * Math.cos(2 * Math.PI * v);
        if (i + 1 < z.length) z[i + 1] = r * Math.sin(2 * Math.PI * v);
      }
      return (shockCache[paths] = z);
    }

    /* Growth factors exp(drift + sigma Z) per level, cached: the inner loop becomes a multiply. */
    static growth(paths, level, esg) {
      const key = paths + ":" + level + ":" + (esg ? 1 : 0);
      if (growthCache[key]) return growthCache[key];
      const z = Market.shocks(paths);
      const { mu, sigma } = Market.portfolio(level, esg);
      const drift = mu - 0.5 * sigma * sigma;
      const g = new Float64Array(z.length);
      for (let i = 0; i < z.length; i++) g[i] = Math.exp(drift + sigma * z[i]);
      return (growthCache[key] = g);
    }

    /* p-th percentile (0..1) of an already sorted array */
    static percentile(sorted, p) {
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = Market;
  else global.Market = Market;
})(typeof window !== "undefined" ? window : globalThis);
