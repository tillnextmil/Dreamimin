/* ============================================================
   COGNIFI — planning engine
   Everything is in today's dollars, using after-inflation
   (real) returns, so a goal's cost means what it says.

   The work is split across five classes in src/:
   - Market:            risk levels and simulated markets
   - GoalSolver:        pooled multi-goal dynamic program
   - GoalPlanner:       Monte Carlo of that policy, best risk cap
   - TaxCalculator:     federal tax brackets and IRS tables
   - RetirementPlanner: year-by-year retirement withdrawals

   This file keeps the one `Engine` object app.js talks to.
   ============================================================ */

(function (global) {
  "use strict";

  const { Market, GoalSolver, GoalPlanner, TaxCalculator, RetirementPlanner } = global;

  global.Engine = {
    BASE_YEAR: Market.BASE_YEAR,
    MAX_YEARS: Market.MAX_YEARS,
    RISK: Market.RISK,
    ESG_MU: Market.ESG_MU,
    FULL_PATHS: GoalPlanner.FULL_PATHS,
    portfolio: Market.portfolio,
    solve: GoalSolver.solve,
    simulateGoals: GoalPlanner.simulate,
    optimize: GoalPlanner.optimize,
    standalone: GoalPlanner.standalone,
    retirement: RetirementPlanner.plan,
    ordinaryTax: TaxCalculator.ordinaryTax,
    annuityRate: RetirementPlanner.annuityRate,
  };
})(window);
