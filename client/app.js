/* ============================================================
   Starts the page: creates the goal API client and the three
   step controllers, and keeps them in step. Whenever something
   changes, update() refreshes step 1, then the goals, then the
   chances, and tells the step bar. Also handles Start over.

   The page's layers (see README.md):
     views/        what's on screen; no rules, no server calls
     controllers/  user input in, domain classes and API calls out
     api/          the only code that talks to the server
     ../src/       domain classes, shared with the server
   ============================================================ */

(function (D) {
  "use strict";

  /* Goals are saved on the server once POST, PUT and DELETE /api/goals exist there. Until then,
     and on a page opened straight from disk, MemoryGoalApi keeps them (same contract, but they
     are gone after a reload). Set this to true when those routes are merged. */
  const SERVER_SAVES_GOALS = false;
  const useServer = SERVER_SAVES_GOALS && location.protocol.startsWith("http");
  const api = useServer ? new D.GoalApi.HttpGoalApi() : new D.GoalApi.MemoryGoalApi();

  const form = document.getElementById("plan-form");
  /* tells the step navigation (views/steps.js) what changed, so it can update the step bar and the chance ring */
  const notify = (name, detail = {}) => document.dispatchEvent(new CustomEvent(name, { detail }));

  const odds = D.controllers.odds({ notify, showImpact: D.views.money.showSpendingImpact });
  const money = D.controllers.money({ form, onChange: update, onSpendingChanged: odds.spendingChanged });
  const goals = D.controllers.goals({ form, api, onChange: update });

  function update() {
    const { profile, funds, fundsReady } = money.refresh();
    /* wealth starts from the available funds when they're entered, otherwise from the net worth;
       the goal check (step 2) and the chances (step 3) both start from it, so they agree */
    const wealth = funds ? funds.balance : profile ? profile.netWorth : 0;
    const goal = goals.refresh(profile, wealth);
    odds.show({ profile, goal, fundsReady, wealth });
    notify("plan:update", { profile, goal, goalCount: goals.count() });
  }

  /* ---------- Start over ---------- */

  async function startOver() {
    money.reset();
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
  goals.load();
})(window.Dreamimin);
