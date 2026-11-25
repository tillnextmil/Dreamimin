/* ============================================================
   PlanService: saving the plans the page works out, between the
   routes (HTTP) and the repositories (SQL). MultiGoalPlan, the
   domain class the page builds its result with, checks the plan
   and gives each goal its verdict; every goal it scores must be
   one of the user's goals (SPECIFICATIONS.md, item 12). Anything
   the request gets wrong is thrown as a ServiceError.
   ============================================================ */

const MultiGoalPlan = require("../../src/multiGoalPlan");
const ServiceError = require("./serviceError");

const NO_GOAL = "No goal with that id.";

class PlanService {
  /* profileId: the user whose plans these are (one profile until sign-in exists) */
  constructor(planRepository, goalRepository, { profileId }) {
    this.plans = planRepository;
    this.goals = goalRepository;
    this.profileId = profileId;
  }

  /* checks the plan, then that each of its goals exists, and saves it with each goal's verdict */
  savePlan(input) {
    const plan = this.#checked(input);
    if (!plan.goals.every((r) => Number.isInteger(r.goalId) && this.goals.findById(this.profileId, r.goalId))) {
      throw ServiceError.notFound(NO_GOAL);
    }
    return this.plans.create(this.profileId, {
      maxRiskLevel: plan.maxRiskLevel,
      utility: plan.utility,
      dpUtility: plan.dpUtility,
      rlEfficiency: plan.rlEfficiency,
      riskLevelByYear: [...plan.riskLevelByYear],
      goals: plan.goals.map((r) => ({ goalId: r.goalId, pFull: r.full.value, pPartial: r.partial.value, verdict: r.verdict })),
    });
  }

  /* the contract's fields only (anything else, such as portfolio names, is ignored), as a MultiGoalPlan;
     a 400 with a message per invalid field otherwise */
  #checked(input) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const { maxRiskLevel, utility, dpUtility, rlEfficiency, riskLevelByYear, goals } = body;
    const fields = { maxRiskLevel, utility, dpUtility, rlEfficiency, riskLevelByYear, goals };
    const errors = MultiGoalPlan.validate(fields);
    if (Object.keys(errors).length) throw ServiceError.invalid(errors);
    return new MultiGoalPlan(fields);
  }
}

module.exports = PlanService;
