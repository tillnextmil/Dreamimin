/* ============================================================
   RetirementPlanner — year-by-year withdrawals across traditional,
   Roth and taxable accounts, with an optional annuity.
   ============================================================ */

(function (global) {
  "use strict";

  const TaxCalculator = typeof require === "function" ? require("./taxCalculator") : global.TaxCalculator;

  class RetirementPlanner {
    static GAIN_SHARE = 0.5;   // share of a taxable-account withdrawal that is a capital gain
    static HEIR_RATE = 0.24;   // tax heirs pay on inherited traditional money

    /* conventional, plus filling each bracket with and without Roth conversions */
    static STRATEGIES = [
      { kind: "conventional" },
      ...["10%", "12%", "22%"].flatMap((bracket) => [{ kind: "fill", bracket, convert: false }, { kind: "fill", bracket, convert: true }]),
    ];

    static annuityRate(age) { return Math.min(0.08, Math.max(0.035, 0.05 + 0.0015 * (age - 65))); }

    /* One retirement, year by year.
       strat = { kind: "conventional" }  taxable, then traditional, then Roth
             | { kind: "fill", bracket, convert }  traditional up to a bracket, then taxable, Roth, rest of traditional */
    static drawdown(start, o, strat, spend) {
      let tr = start.trad, ro = start.roth, tx = start.taxable;
      const A = start.annuityIncome, r = o.drawReturn;
      const fillTop = strat.kind === "fill" ? TaxCalculator.FILL[strat.bracket] : 0;
      const GAIN_SHARE = RetirementPlanner.GAIN_SHARE;
      const rows = [];
      let taxSum = 0, ranOutAge = null, basisLeft = start.annuityBasis;

      for (let age = o.retireAge; age < o.lifeExp; age++) {
        const forced = age >= TaxCalculator.RMD_AGE ? Math.min(tr, tr / TaxCalculator.rmdDivisor(age)) : 0;
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
          const tax = TaxCalculator.totalTax(baseIncome + a.t, GAIN_SHARE * a.x);
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
            const ctax = TaxCalculator.totalTax(baseIncome + a.t + converted, GAIN_SHARE * a.x) - ev.tax;
            tr -= converted; ro += converted - ctax; tax += ctax;
          }
        }
        taxSum += tax;
        rows.push({ age, trad: a.t + forced, rmd: forced, taxable: a.x, roth: a.r, annuity: A, tax, converted, spent: Math.min(ev.net, spend), endTrad: tr, endRoth: ro, endTaxable: tx });

        tr = Math.max(0, tr) * (1 + r); ro = Math.max(0, ro) * (1 + r); tx = Math.max(0, tx) * (1 + r);
      }
      return { rows, totalTax: taxSum, ranOutAge, legacy: tx + ro + tr * (1 - RetirementPlanner.HEIR_RATE) };
    }

    static plan(o) {
      const annuityRate = RetirementPlanner.annuityRate, drawdown = RetirementPlanner.drawdown;
      const STRATEGIES = RetirementPlanner.STRATEGIES;

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
        annuityExclusion = annuityBasis > 0 ? Math.min(annuityBasis * annuityRate(o.retireAge), annuityBasis / TaxCalculator.lifeMultiple(o.retireAge)) : 0;
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
        fillTop: best.s.kind === "fill" ? TaxCalculator.FILL[best.s.bracket] : 0, rmdAge: TaxCalculator.RMD_AGE,
      };
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = RetirementPlanner;
  else global.RetirementPlanner = RetirementPlanner;
})(typeof window !== "undefined" ? window : globalThis);
