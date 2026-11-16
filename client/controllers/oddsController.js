/* ============================================================
   Step 3 controller (Your chances): runs the PpoPlanner for the
   selected goal, in a Web Worker when the browser allows it and
   on the page otherwise, keeps finished results, and tells the
   odds view and the step bar what to show.
   ============================================================ */

(function (D) {
  "use strict";

  const view = D.views.odds;
  const DEBOUNCE_MS = 450;   // wait for typing to pause before training
  const SLICE_MS = 30;       // keep each on-page slice under one frame

  /* notify(name, detail) tells the step bar (views/steps.js) what changed;
     showImpact(text) shows on step 1 how recorded spending changed the chance */
  function createOddsController({ notify, showImpact }) {
    /* the planner gives the same result for the same job, so finished results are kept per job */
    const plans = new Map();
    let worker = null, runId = 0, debounce = null, currentKey = null;
    /* After spending is recorded or removed, step 1 says how the chance changed, e.g. "39% to 8%".
       lastChance is the chance shown most recently; chanceBefore is the chance before the change. */
    let lastChance = null, chanceBefore = null, goalName = "";
    let shownGoalId = null;   // the goal whose chance is on screen, so switching goals clears the old details

    function stopPlanner() {
      runId++;
      clearTimeout(debounce);
      if (worker) worker.terminate();
      worker = null;
    }

    function clear(text) {
      stopPlanner();
      currentKey = null;
      shownGoalId = null;
      lastChance = chanceBefore = null;
      showImpact("");
      view.showEmpty(text);
      notify("plan:empty");
    }

    function showTraining(done, total, prob) {
      view.showTraining(done, total, prob);
      notify("plan:progress", { prob });
    }

    function showResult(plan, result) {
      const { probability } = result;
      showSpendingImpact(probability.toPercent());
      view.showPlan(plan, result);
      notify("plan:result", { value: probability.value, text: probability.toPercent(), tone: probability.tone, verdict: probability.verdict });
    }

    function showSpendingImpact(now) {
      lastChance = now;
      if (!chanceBefore) return showImpact("");
      const of = goalName ? `of reaching ${goalName}` : "of reaching your goal";
      showImpact(now === chanceBefore ? `Your chance ${of} stays at ${now}.` : `Your chance ${of} went from ${chanceBefore} to ${now}.`);
      chanceBefore = null;
    }

    /* Without a worker (browsers block them on file:// pages) the planner runs here, a slice at a time. */
    function runOnPage(job, id, onMessage) {
      const steps = PpoPlanner.planSteps(job);
      const slice = () => {
        if (id !== runId) return;
        const until = performance.now() + SLICE_MS;
        try {
          while (performance.now() < until) {
            const next = steps.next();
            if (next.done) return onMessage({ type: "result", ...next.value });
            onMessage(next.value);
          }
        } catch (error) {
          console.error("PpoPlanner failed", error);
          view.showTrainingError();
          return;
        }
        setTimeout(slice);
      };
      setTimeout(slice);
    }

    function runPlanner(plan, key) {
      const id = runId;
      const onMessage = (m) => {
        if (id !== runId) return;
        if (m.type === "progress") showTraining(m.done, m.total, m.prob);
        else if (m.type === "result") {
          const result = new GoalAnalysisResult(m);
          plans.set(key, result);
          showResult(plan, result);
          if (worker) worker.terminate();
          worker = null;
        }
      };
      try {
        worker = new Worker("src/planner.worker.js");
        worker.onmessage = (ev) => onMessage(ev.data);
        worker.onerror = (ev) => {
          ev.preventDefault();
          if (id !== runId) return;
          worker.terminate();
          worker = null;
          runOnPage(plan.job, id, onMessage);
        };
        worker.postMessage({ job: plan.job });
      } catch {
        worker = null;
        runOnPage(plan.job, id, onMessage);
      }
    }

    /* profile and goal are a FinancialProfile and the selected FinancialGoal, or null; wealth is
       where the money starts: the funds left when they're entered, otherwise the net worth */
    function show({ profile, goal, fundsReady, wealth }) {
      goalName = goal ? goal.name : "";
      if (!profile || !goal) return clear("Add your money and a goal to see your chances of reaching it if you invest.");
      if (!fundsReady) return clear("Fix your available funds to see your chances.");
      const months = goal.monthsRemaining();
      if (months > PpoPlanner.MAX_YEARS * 12) {
        return clear(`The planner covers goals up to ${PpoPlanner.MAX_YEARS} years away. Pick an earlier date to see your chances.`);
      }

      const job = { netWorth: wealth, monthlySaving: profile.monthlyCashFlow, cost: goal.targetAmount, months };
      const key = JSON.stringify(job);
      if (key === currentKey) return;   // nothing the planner uses has changed
      currentKey = key;
      stopPlanner();

      const plan = { job, netWorth: wealth, monthly: profile.monthlyCashFlow, cost: goal.targetAmount, months, date: FinancialGoal.parseDate(goal.targetDate) };
      const fresh = goal.id !== shownGoalId;
      shownGoalId = goal.id;
      if (plans.has(key)) return showResult(plan, plans.get(key));

      view.showWorking(fresh);
      showTraining(0, 0, null);
      debounce = setTimeout(() => runPlanner(plan, key), DEBOUNCE_MS);
    }

    /* call just before spending changes, so the next result can say how the chance moved */
    function spendingChanged() {
      chanceBefore = lastChance;
      showImpact(chanceBefore ? "Working out your new chance…" : "");
    }

    const reset = () => { lastChance = chanceBefore = null; showImpact(""); };

    view.showPortfolios(InvestmentPortfolio.all());
    return { show, spendingChanged, reset };
  }

  D.controllers = D.controllers || {};
  D.controllers.odds = createOddsController;
})(window.Dreamimin);
