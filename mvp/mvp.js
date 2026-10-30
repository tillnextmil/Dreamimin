/* ============================================================
   COGNIFI MVP — page logic
   Picture + one goal in, odds + verdict out. Any edit re-runs
   the planner (src/ppoPlanner.js, in a worker); the same inputs
   always give the same odds.
   ============================================================ */

(function () {
  "use strict";

  const THIS_YEAR = new Date().getFullYear();
  const MAX_YEARS = 40;
  const STORE = "cognifi-mvp";
  const DEFAULTS = { netWorth: 15000, income: 4800, expenses: 3900, goalName: "House down payment", cost: 110000, year: THIS_YEAR + 7 };

  const $ = (id) => document.getElementById(id);
  const fields = ["netWorth", "income", "expenses", "goalName", "cost", "year"];
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

  let worker = null, debounce = null, lastResult = null;

  /* ---------- State ---------- */
  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || "{}") }; }
    catch (e) { return { ...DEFAULTS }; }
  }
  function save(s) {
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {}
  }
  function read() {
    const s = {};
    for (const f of fields) s[f] = f === "goalName" ? $(f).value.trim() : $(f).value === "" ? NaN : Number($(f).value);
    return s;
  }
  function validate(s) {
    const bad = [];
    if (!Number.isFinite(s.netWorth)) bad.push(["netWorth", "Enter your net worth (it can be negative)."]);
    if (!(s.income >= 0)) bad.push(["income", "Enter your monthly income."]);
    if (!(s.expenses >= 0)) bad.push(["expenses", "Enter your monthly expenses."]);
    if (!(s.cost > 0)) bad.push(["cost", "Give the goal a cost above $0."]);
    if (!(Number.isInteger(s.year) && s.year > THIS_YEAR && s.year <= THIS_YEAR + MAX_YEARS))
      bad.push(["year", `Pick a year from ${THIS_YEAR + 1} to ${THIS_YEAR + MAX_YEARS}.`]);
    return bad;
  }

  /* ---------- Rendering ---------- */
  function renderPicture(s) {
    const name = s.goalName || "Your goal";
    $("goal-title").textContent = name;
    $("goal-meta").textContent = s.cost > 0 && Number.isInteger(s.year) ? `${money(s.cost)} by ${s.year}` : "";
    const sav = (s.income || 0) - (s.expenses || 0);
    $("savings").textContent = sav > 0 ? `You save ${money(sav)} a month.` : sav < 0 ? `You spend ${money(-sav)} a month more than you earn.` : "You break even each month.";
  }

  function reason(s, probability) {
    const years = s.year - THIS_YEAR;
    const monthly = s.income - s.expenses;
    const putAway = Math.max(0, s.netWorth) + Math.max(0, monthly) * 12 * years;
    let text;
    if (monthly <= 0) {
      text = `You aren't saving anything each month, so only the ${money(Math.max(0, s.netWorth))} you have today can grow toward this.`;
    } else {
      text = `Saving ${money(monthly)} a month until ${s.year}, plus the ${money(Math.max(0, s.netWorth))} you have now, adds up to ${money(putAway)} before any growth, against the goal's ${money(s.cost)} cost.`;
    }
    if (!probability.isRealistic) {
      const need = (s.cost - Math.max(0, s.netWorth)) / (12 * years);
      if (need > Math.max(0, monthly)) text += ` Without growth it would take saving about ${money(need)} a month.`;
      else text += ` The money is there on paper; the risk is a bad run in the markets right before ${s.year}.`;
    }
    return text;
  }

  function showBusy(on) {
    $("card").setAttribute("aria-busy", on ? "true" : "false");
  }

  /* result is a GoalAnalysisResult */
  function renderResult(s, result) {
    const { probability, benchmark, outcomes } = result;
    $("prob").textContent = probability.toPercent();
    $("verdict").textContent = probability.verdict;
    $("verdict").dataset.tone = probability.tone;
    $("reason").textContent = reason(s, probability);
    $("glide").textContent = result.describeGlide(THIS_YEAR);
    $("range").textContent = `About ${money(outcomes.typical)} by ${s.year} in a typical market; ${money(outcomes.bad)} in a bad one, ${money(outcomes.good)} in a good one.`;
    $("facts").hidden = false;
    $("efficiency").textContent = result.efficiency !== null
      ? `As a check, an exact dynamic-programming solution of the same problem reaches the goal ${benchmark.toPercent()} of the time. The PPO planner gets ${result.efficiencyText()} of that (its RL efficiency).`
      : "As a check, an exact dynamic-programming solution of the same problem also can't reach this goal.";
  }

  /* ---------- Planner ---------- */
  function run(s) {
    if (worker) worker.terminate();
    worker = new Worker("../src/planner.worker.js");
    showBusy(true);
    $("bar").style.width = "0%";
    $("training-text").textContent = "Training the planner…";
    if (lastResult) { $("verdict").textContent = "Updating…"; $("verdict").dataset.tone = "mid"; }

    const job = { netWorth: s.netWorth, monthlySaving: s.income - s.expenses, cost: s.cost, months: 12 * (s.year - THIS_YEAR) };
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "progress") {
        $("bar").style.width = Math.round((100 * m.done) / m.total) + "%";
        $("training-text").textContent = `Training the planner… round ${m.done} of ${m.total}`;
        if (m.prob !== null) $("prob").textContent = new GoalProbability(m.prob).toPercent();
      } else if (m.type === "result") {
        lastResult = new GoalAnalysisResult(m);
        renderResult(s, lastResult);
        showBusy(false);
        worker.terminate(); worker = null;
      }
    };
    worker.onerror = () => {
      $("training-text").textContent = "The planner hit an error. Try changing a value.";
    };
    worker.postMessage({ job });
  }

  function onChange() {
    const s = read();
    renderPicture(s);
    const bad = validate(s);
    for (const f of fields) $(f).removeAttribute("aria-invalid");
    for (const [f] of bad) $(f).setAttribute("aria-invalid", "true");
    $("error").hidden = !bad.length;
    $("error").textContent = bad.map((b) => b[1]).join(" ");
    if (bad.length) return;
    save(s);
    clearTimeout(debounce);
    debounce = setTimeout(() => run(s), 450);
  }

  /* ---------- Start ---------- */
  const s = load();
  for (const f of fields) $(f).value = s[f];
  $("year").min = THIS_YEAR + 1;
  $("year").max = THIS_YEAR + MAX_YEARS;
  $("inputs").addEventListener("input", onChange);
  $("inputs").addEventListener("submit", (e) => e.preventDefault());
  onChange();
})();
