/* ============================================================
   Step 3 controller (Your chances): plans every goal together
   with the MultiGoalPlanner, in a Web Worker when the browser
   allows it and on the page otherwise, keeps finished plans,
   answers the what-if slider from the planner's quick estimate,
   and tells the odds view and the step bar what to show.
   ============================================================ */

(function (D) {
  "use strict";

  const view = D.views.odds;
  const DEBOUNCE_MS = 450;          // wait for typing to pause before training
  const SLICE_MS = 30;              // keep each on-page slice under one frame
  const WHATIF_DEBOUNCE_MS = 120;   // wait for the slider to pause before estimating
  const WHATIF_STEP = 50;           // the slider moves the monthly saving in $50 steps
  const WHATIF_SPAN = 500;          // and reaches at least $500 above what is saved now

  const NO_GOALS = "Add your money and a goal to see your chances of reaching it if you invest.";

  /* the planner's fields of a goal, so renaming a goal doesn't retrain */
  const plannerGoal = ({ id, targetAmount, months, priority, minAcceptableAmount }) => ({ id, targetAmount, months, priority, minAcceptableAmount });

  /* notify(name, detail) tells the step bar (views/steps.js) what changed;
     showImpact(text) shows on step 1 how recorded spending changed the chance */
  function createOddsController({ notify, showImpact }) {
    /* the planner gives the same result for the same job, so finished plans are kept per job */
    const plans = new Map();
    let worker = null, runId = 0, debounce = null, currentKey = null;
    let plan = null;        // what the page shows: the planned goals, the money and today
    let shownLook = null;   // everything the page shows, so an update that changes nothing is skipped
    /* After spending is recorded or removed, step 1 says how the chosen goal's chance changed, e.g.
       "39% to 8%". lastChance is the chance shown most recently; chanceBefore is the one before. */
    let lastChance = null, chanceBefore = null, goalName = "";

    function stopPlanner() {
      runId++;
      clearTimeout(debounce);
      if (worker) worker.terminate();
      worker = null;
    }

    function clear(text) {
      stopPlanner();
      currentKey = shownLook = plan = null;
      lastChance = chanceBefore = null;
      resetWhatIf(null);
      showImpact("");
      view.showEmpty(text);
      notify("plan:empty");
    }

    /* done: { result: a MultiGoalPlan, timeline: the planner's timeline } */
    function showResult(done) {
      const { result, timeline } = done;
      view.showPlan(plan, result);
      view.showTimeline({
        points: timeline,
        start: Math.max(0, plan.wealth),
        goals: plan.goals.map((g) => ({ name: g.name, months: g.months, date: FinancialGoal.parseDate(g.targetDate) })),
        today: plan.today,
      });
      const chosen = result.goals.find((r) => String(r.goalId) === String(plan.selectedId));
      showSpendingImpact(chosen ? chosen.chance.toPercent() : null);
      const text = result.goals.length === 1
        ? result.goals[0].chance.toPercent()
        : `${result.realisticCount()} of ${result.goals.length} realistic`;
      notify("plan:result", { text });
    }

    function showSpendingImpact(now) {
      lastChance = now;
      if (!chanceBefore || !now) return showImpact("");
      const of = goalName ? `of reaching ${goalName}` : "of reaching your goal";
      showImpact(now === chanceBefore ? `Your chance ${of} stays at ${now}.` : `Your chance ${of} went from ${chanceBefore} to ${now}.`);
      chanceBefore = null;
    }

    /* ---------- training ---------- */

    /* Without a worker (browsers block them on file:// pages) the planner runs here, a slice at a time. */
    function runOnPage(job, id, onMessage) {
      const steps = MultiGoalPlanner.planSteps(job);
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
          console.error("MultiGoalPlanner failed", error);
          view.showTrainingError();
          return;
        }
        setTimeout(slice);
      };
      setTimeout(slice);
    }

    function runPlanner(job, key) {
      const id = runId;
      const onMessage = (m) => {
        if (id !== runId) return;
        if (m.type === "progress") {
          view.showTraining(m.done, m.total, m.goals);
          notify("plan:progress");
        } else if (m.type === "result") {
          let done;
          try {
            done = { result: new MultiGoalPlan(m), timeline: m.timeline };
          } catch (error) {
            console.error("The plan didn't make sense", error);
            view.showTrainingError();
            return;
          }
          plans.set(key, done);
          showResult(done);
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
          runOnPage(job, id, onMessage);
        };
        worker.postMessage({ job });
      } catch {
        worker = null;
        runOnPage(job, id, onMessage);
      }
    }

    /* profile is a FinancialProfile or null; goals are all the saved goals (API shape); selected is
       the goal chosen in step 2, or null; wealth is where the money starts: the funds left when
       they're entered, otherwise the net worth, minus the emergency fund */
    function show({ profile, goals, selected, fundsReady, wealth }) {
      goalName = selected ? selected.name : "";
      if (!profile && !goals.length) return clear(NO_GOALS);
      if (!profile) return clear("Add your monthly income and spending in step 1 to see your chances.");
      if (!goals.length) return clear("Add a goal in step 2 to see your chances of reaching it if you invest.");
      if (!fundsReady) return clear("Fix your available funds to see your chances.");

      const today = new Date();
      const { planned, left } = GoalList.forPlanner(goals, today);
      if (!planned.length) {
        return clear(`None of your goals can be planned. In step 2, give each one a date after today and within ${GoalList.MAX_YEARS} years.`);
      }

      const job = { netWorth: wealth, monthlySaving: profile.monthlyCashFlow, goals: planned.map(plannerGoal) };
      const key = JSON.stringify(job);
      const next = { goals: planned, left, wealth, keepsFund: profile.emergencyFund > 0, monthly: profile.monthlyCashFlow, today, selectedId: selected ? selected.id : null };
      const look = JSON.stringify([key, planned.map((g) => [g.name, g.targetDate]), left, next.keepsFund, next.selectedId]);
      if (look === shownLook) return;   // nothing on the page would change
      const fresh = plan === null;
      shownLook = look;
      plan = next;
      if (key !== whatIf.key) resetWhatIf(job, key);
      else whatIf.goals = planned;   // the same job; names may have changed

      view.showWorking({ goals: planned, left, fresh, plan });
      if (plans.has(key)) {
        stopPlanner();
        currentKey = key;
        return showResult(plans.get(key));
      }
      if (key === currentKey) return;   // the same plan is still training; only names or the chosen goal changed
      currentKey = key;
      stopPlanner();
      view.showTraining(0, 0, null);
      notify("plan:progress");
      debounce = setTimeout(() => runPlanner(job, key), DEBOUNCE_MS);
    }

    /* ---------- what if ---------- */

    /* One request at a time goes to a worker of its own, so the slider never waits on training;
       while one runs, only the newest slider value waits for its turn. */
    const whatIf = { key: null, job: null, goals: [], run: 0, timer: null, busy: false, waiting: null, worker: undefined };
    const slider = document.getElementById("whatif-saving");

    function resetWhatIf(job, key = null) {
      whatIf.run++;
      clearTimeout(whatIf.timer);
      whatIf.key = key;
      whatIf.job = job;
      whatIf.goals = job ? plan.goals : [];
      if (!job) return;
      const current = job.monthlySaving;
      const min = current > 0 ? -Math.floor(current / WHATIF_STEP) * WHATIF_STEP : 0;
      const max = Math.max(WHATIF_SPAN, Math.ceil(Math.abs(current) / WHATIF_STEP) * WHATIF_STEP);
      view.setWhatIfRange({ current, min, max, step: WHATIF_STEP });
    }

    function estimate(delta) {
      const run = ++whatIf.run;
      if (delta === 0) return view.showWhatIf([]);
      view.showWhatIfWorking();
      const message = { task: "whatIf", job: whatIf.job, changes: { monthlySaving: whatIf.job.monthlySaving + delta } };
      quickTask(message, (m) => {
        if (run !== whatIf.run || !m) return;
        const names = new Map(whatIf.goals.map((g) => [String(g.id), g.name]));
        view.showWhatIf(m.goals
          .filter((g) => g.change !== null && names.has(String(g.goalId)))
          .map((g) => ({ name: names.get(String(g.goalId)), before: g.before, after: g.after, change: g.change })));
      });
    }

    function quickTask(message, onDone) {
      whatIf.waiting = { message, onDone };
      if (!whatIf.busy) sendWaiting();
    }

    function sendWaiting() {
      if (!whatIf.waiting) return;
      const { message, onDone } = whatIf.waiting;
      whatIf.waiting = null;
      whatIf.busy = true;
      const finish = (data) => {
        whatIf.busy = false;
        onDone(data);
        sendWaiting();
      };
      const onPage = () => setTimeout(() => {
        let data = null;
        try {
          data = MultiGoalPlanner.whatIf(message.job, message.changes);
        } catch (error) {
          console.error("What-if estimate failed", error);
        }
        finish(data);
      });
      if (whatIf.worker === undefined) {
        try {
          whatIf.worker = new Worker("src/planner.worker.js");
        } catch {
          whatIf.worker = null;
        }
      }
      if (!whatIf.worker) return onPage();
      whatIf.worker.onmessage = (ev) => finish(ev.data);
      whatIf.worker.onerror = (ev) => {
        ev.preventDefault();
        whatIf.worker.terminate();
        whatIf.worker = null;
        onPage();
      };
      whatIf.worker.postMessage(message);
    }

    slider.addEventListener("input", () => {
      if (!whatIf.job) return;
      const delta = Number(slider.value);
      view.showWhatIfValue(delta);
      clearTimeout(whatIf.timer);
      whatIf.timer = setTimeout(() => estimate(delta), WHATIF_DEBOUNCE_MS);
    });
    document.getElementById("whatif-reset").addEventListener("click", () => {
      slider.value = "0";
      view.showWhatIfValue(0);
      estimate(0);
      slider.focus();
    });

    /* ---------- spending on step 1 ---------- */

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
