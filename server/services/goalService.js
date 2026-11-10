/* ============================================================
   GoalService: what the app does with goals, between the
   routes (HTTP) and the repository (SQL). Rules such as
   validating with FinancialGoal (src/financialGoal.js), the
   20-goal limit, and sort and search (SPECIFICATIONS.md,
   item 12) belong here, so they can be tested without HTTP.
   ============================================================ */

class GoalService {
  /* profileId: the user whose goals these are (one profile until sign-in exists) */
  constructor(goalRepository, { profileId }) {
    this.goals = goalRepository;
    this.profileId = profileId;
  }

  listGoals() {
    return this.goals.findAll(this.profileId);
  }
}

module.exports = GoalService;
