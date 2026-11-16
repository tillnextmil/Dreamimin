/* ============================================================
   GoalService: what the app does with goals, between the
   routes (HTTP) and the repository (SQL). The rules come from
   the domain classes the page uses too: FinancialGoal checks
   each goal, and GoalList has the 20-goal limit and the sort
   and search (SPECIFICATIONS.md, item 12). Anything the request
   gets wrong is thrown as a ServiceError.
   ============================================================ */

const FinancialGoal = require("../../src/financialGoal");
const GoalList = require("../../src/goalList");
const ServiceError = require("./serviceError");

const NOT_FOUND = "No goal with that id.";

class GoalService {
  /* profileId: the user whose goals these are (one profile until sign-in exists);
     now gives "today", so tests can fix the date */
  constructor(goalRepository, { profileId, now = () => new Date() }) {
    this.goals = goalRepository;
    this.profileId = profileId;
    this.now = now;
  }

  /* the goals whose name contains `search`, in the order `sort` gives (soonest date by default) */
  listGoals({ sort = GoalList.DEFAULT_SORT, search = "" } = {}) {
    const problem = GoalList.checkSort(sort);
    if (problem) throw ServiceError.invalid({ sort: problem });
    return GoalList.arrange(this.goals.findAll(this.profileId), { sort, search });
  }

  getGoal(id) {
    return this.#find(id);
  }

  /* checks the goal, then the 20-goal limit, and saves it */
  createGoal(input) {
    const fields = this.#checked(input);
    if (!GoalList.canAdd(this.goals.count(this.profileId))) throw ServiceError.conflict(GoalList.TOO_MANY);
    return this.goals.create(this.profileId, fields);
  }

  /* every field is sent, as with PUT; the id stays the same, so a later targetDate extends the goal */
  updateGoal(id, input) {
    const goal = this.#find(id);
    return this.goals.update(this.profileId, goal.id, this.#checked(input));
  }

  deleteGoal(id) {
    const goal = this.#find(id);
    this.goals.remove(this.profileId, goal.id);
  }

  /* the goal with that id; an id that isn't a whole number is treated as unknown */
  #find(id) {
    const goalId = /^[1-9]\d*$/.test(String(id)) ? Number(id) : null;
    const goal = goalId === null ? null : this.goals.findById(this.profileId, goalId);
    if (!goal) throw ServiceError.notFound(NOT_FOUND);
    return goal;
  }

  /* the fields to save, with the contract's defaults, checked by FinancialGoal; unknown fields are ignored */
  #checked(input) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const fields = {
      name: body.name === undefined ? "" : body.name,   // FinancialGoal would otherwise default it to "My goal"
      targetAmount: body.targetAmount,
      targetDate: body.targetDate,
      priority: body.priority === undefined ? FinancialGoal.DEFAULT_PRIORITY : body.priority,
      minAcceptableAmount: body.minAcceptableAmount === undefined ? 0 : body.minAcceptableAmount,
    };
    const errors = FinancialGoal.validate({ ...fields, asOf: this.now() });
    if (Object.keys(errors).length) throw ServiceError.invalid(errors);
    return { ...fields, name: fields.name.trim() };
  }
}

module.exports = GoalService;