/* ============================================================
   Starts the page: creates the goal API client and the three
   step controllers, and keeps them in step. Whenever something
   changes, update() refreshes step 1, then the goals, then the
   chances for every goal, and tells the step bar. Also handles
   Start over.

   The page's layers (see README.md):
     views/        what's on screen; no rules, no server calls
     controllers/  user input in, domain classes and API calls out
     api/          the only code that talks to the server
     ../src/       domain classes, shared with the server
   ============================================================ */

(function (D) {
  "use strict";

  /* Goals are saved on the server through /api/goals, step 1 (profile, funds and spending) through
     /api/profile, /api/funds and /api/expenses, and each finished plan through /api/plans. On a page
     opened straight from disk, MemoryGoalApi keeps the goals instead (same contract, but they are
     gone after a reload), step 1 stays in memory, and plans aren't saved. */
  const SERVER_SAVES_GOALS = true;
  const useServer = SERVER_SAVES_GOALS && location.protocol.startsWith("http");
  const api = useServer ? new D.GoalApi.HttpGoalApi() : new D.GoalApi.MemoryGoalApi();
  const planApi = useServer ? new D.PlanApi.HttpPlanApi() : null;
  const moneyApi = useServer ? new D.MoneyApi.HttpMoneyApi() : null;

  const form = document.getElementById("plan-form");
  /* tells the step navigation (views/steps.js) what changed, so it can update the step bar */
  const notify = (name, detail = {}) => document.dispatchEvent(new CustomEvent(name, { detail }));

  const odds = D.controllers.odds({
    notify,
    showImpact: D.views.money.showSpendingImpact,
    savePlan: planApi && ((body) => planApi.save(body)),
  });
  const money = D.controllers.money({ form, api: moneyApi, onChange: update, onSpendingChanged: odds.spendingChanged });
  const goals = D.controllers.goals({ form, api, onChange: update });

  function update() {
    const { profile, funds, fundsReady } = money.refresh();
    /* the money the goals start from: the available funds when they're entered, otherwise the net
       worth, minus the emergency fund (FinancialProfile.moneyForGoals). The goal check (step 2) and
       the chances (step 3) both start from it, so they agree. */
    const wealth = profile ? profile.moneyForGoals(funds ? funds.balance : null) : 0;
    const goal = goals.refresh(profile, wealth);
    odds.show({ profile, goals: goals.all(), selected: goal, fundsReady, wealth });
    notify("plan:update", { profile, goal, goalCount: goals.count() });
  }

  /* ---------- Start over ---------- */

  async function startOver() {
    await money.reset();
    odds.reset();
    await goals.removeAll();   // updates the page when done
  }

  /* Start over asks first when there is something to lose; with nothing entered it just clears */
  document.getElementById("start-over").addEventListener("click", async () => {
    const somethingToLose = money.hasAnswers() || goals.count() > 0 || goals.hasTyped();
    if (!somethingToLose || (await D.views.fields.confirm(document.getElementById("start-over-dialog")))) {
      startOver();
    }
  });

  form.addEventListener("submit", (event) => event.preventDefault());

  update();
  money.load();
  goals.load();
})(window.Dreamimin);