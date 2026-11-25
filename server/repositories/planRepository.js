/* ============================================================
   PlanRepository: the SQL for saved plans. A plan is a row in
   plan_result, a row in goal_result per goal it scored, and a
   row in plan_year per year (the planner holds one portfolio a
   year, so allocation_percent is 1). Hands the service plain
   objects in the API's shape (SPECIFICATIONS.md, item 12).
   Every query is limited to one profile.
   ============================================================ */

class PlanRepository {
  constructor(db) {
    this.db = db;
  }

  /* Saves a plan, its goal results and its years in one transaction, so a failure saves none of
     them; returns the plan as findById reads it. plan: { maxRiskLevel, utility, dpUtility,
     rlEfficiency, riskLevelByYear, goals: [{ goalId, pFull, pPartial, verdict }] } */
  create(profileId, plan) {
    this.db.exec("BEGIN");
    try {
      const { lastInsertRowid } = this.db.prepare(`
        INSERT INTO plan_result (profile_id, max_risk_level, utility, dp_utility, rl_efficiency)
        VALUES (?, ?, ?, ?, ?)
      `).run(profileId, plan.maxRiskLevel, plan.utility, plan.dpUtility, plan.rlEfficiency);
      const planId = Number(lastInsertRowid);

      const goal = this.db.prepare(`
        INSERT INTO goal_result (plan_id, goal_id, p_full, p_partial, verdict) VALUES (?, ?, ?, ?, ?)
      `);
      for (const g of plan.goals) goal.run(planId, g.goalId, g.pFull, g.pPartial, g.verdict);

      /* the portfolio is looked up by risk level, so nothing depends on how the portfolios are numbered */
      const year = this.db.prepare(`
        INSERT INTO plan_year (plan_id, year, portfolio_id, allocation_percent)
        SELECT ?, ?, portfolio_id, 1 FROM investment_portfolio WHERE risk_level = ?
      `);
      plan.riskLevelByYear.forEach((level, index) => {
        if (year.run(planId, index + 1, level).changes !== 1) throw new Error(`No portfolio at risk level ${level}.`);
      });

      this.db.exec("COMMIT");
      return this.findById(profileId, planId);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /* One saved plan, or null when the profile has none with that id. Its goals come soonest target
     date first, as the page lists them; a goal deleted since has no result any more. */
  findById(profileId, planId) {
    const row = this.db.prepare(`
      SELECT plan_id, created_at, max_risk_level, utility, dp_utility, rl_efficiency
      FROM plan_result
      WHERE profile_id = ? AND plan_id = ?
    `).get(profileId, planId);
    if (!row) return null;

    const goals = this.db.prepare(`
      SELECT r.goal_id, r.p_full, r.p_partial, r.verdict
      FROM goal_result r JOIN goal g ON g.goal_id = r.goal_id
      WHERE r.plan_id = ?
      ORDER BY g.target_date, g.goal_id
    `).all(planId);
    const years = this.db.prepare(`
      SELECT p.risk_level
      FROM plan_year y JOIN investment_portfolio p ON p.portfolio_id = y.portfolio_id
      WHERE y.plan_id = ?
      ORDER BY y.year
    `).all(planId);

    return {
      id: row.plan_id,
      createdAt: row.created_at,
      maxRiskLevel: row.max_risk_level,
      utility: row.utility,
      dpUtility: row.dp_utility,
      rlEfficiency: row.rl_efficiency,
      riskLevelByYear: years.map((y) => y.risk_level),
      goals: goals.map((g) => ({
        goalId: g.goal_id,
        pFull: g.p_full,
        pPartial: g.p_partial,
        pAny: Math.min(1, g.p_full + g.p_partial),
        verdict: g.verdict,
      })),
    };
  }

  /* how many plans the profile has saved */
  count(profileId) {
    return this.db.prepare("SELECT COUNT(*) AS total FROM plan_result WHERE profile_id = ?").get(profileId).total;
  }
}

module.exports = PlanRepository;
