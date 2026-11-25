/* ============================================================
   Step 3 view (Your chances): a card per goal with its chance
   and verdict, the money over time (timelineChart.js), the
   what-if slider, and the plan's scores. Display only; the odds
   controller runs the planner and decides what to show.
   ============================================================ */

(function (D) {
  "use strict";

  const { format, TimelineChart } = D;
  const $ = (id) => document.getElementById(id);
  const RING = 2 * Math.PI * 27;   // circumference of a goal card's r=27 ring
  const percent = (p) => new GoalProbability(p).toPercent();

  /* a month from today as a Date (the first of that month) */
  const monthFrom = (today, months) => new Date(today.getFullYear(), today.getMonth() + months, 1);

  /* ["Car"] -> "Car"; ["Trip", "Car"] -> "Trip and Car"; three or more -> "Trip, Car and House" */
  function list(names) {
    return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  /* plan: { goals, wealth, keepsFund, monthly, today } as the odds controller built it, where goals
     are the planned goals soonest first, each with `months`, and wealth is the money for goals */
  function reason(plan, result) {
    const { goals, wealth, keepsFund, monthly } = plan;
    const have = Math.max(0, wealth);
    const last = goals[goals.length - 1];
    const total = goals.reduce((sum, g) => sum + g.targetAmount, 0);
    const yours = `the ${format.money(have)} you have for goals` + (keepsFund ? " after your emergency fund" : "");
    const against = goals.length === 1 ? `the goal's ${format.money(total)}` : `${format.money(total)} for all ${goals.length} goals`;
    let text = monthly <= 0
      ? `You aren't saving anything each month, so only ${yours} can grow toward ${goals.length === 1 ? "this goal" : "your goals"}.`
      : `Saving ${format.money(monthly)} a month until ${format.monthYear(FinancialGoal.parseDate(last.targetDate))}, plus ${yours}, adds up to ${format.money(have + monthly * last.months)} before any growth, against ${against}.`;
    if (result && goals.length > 1 && result.realisticCount() < goals.length) {
      const partial = goals.some((g) => g.minAcceptableAmount > 0);
      text += " When the money can't cover everything, the plan pays the most important goals first" +
        (partial ? " and takes the smallest amount you'd accept where you set one." : ".");
    }
    return text;
  }

  function showEmpty(text) {
    $("odds-empty").hidden = false;
    $("odds-result").hidden = true;
    $("odds-empty-text").textContent = text;
    $("odds-announce").textContent = "";
  }

  /* ---------- goal cards ---------- */

  function ring() {
    const box = document.createElement("div");
    box.className = "chance__ring";
    box.setAttribute("aria-hidden", "true");
    box.innerHTML = `<svg viewBox="0 0 64 64"><circle class="chance__track" cx="32" cy="32" r="27"/><circle class="chance__arc" cx="32" cy="32" r="27" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg><span class="chance__num">–</span>`;
    return box;
  }

  function text(tag, className, content) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = content;
    return el;
  }

  /* one card per goal: the planned goals (soonest first), then the ones the planner can't plan */
  function showCards(goals, left) {
    const cards = $("chance-list");
    cards.replaceChildren();
    for (const goal of goals) {
      const item = document.createElement("li");
      item.className = "chance";
      item.dataset.goalId = goal.id;
      const body = document.createElement("div");
      body.className = "chance__body";
      const meta = `${format.money(goal.targetAmount)} by ${format.monthYear(FinancialGoal.parseDate(goal.targetDate))} · Priority ${goal.priority} of 5`;
      body.append(
        text("p", "chance__name", goal.name),
        text("p", "chance__meta", meta),
        text("p", "sr-only chance__sr", ""),
        text("span", "status status--mid", "Working it out…"),
        text("p", "chance__detail", ""),
      );
      item.append(ring(), body);
      cards.append(item);
    }
    for (const goal of left) {
      const item = document.createElement("li");
      item.className = "chance chance--left";
      const body = document.createElement("div");
      body.className = "chance__body";
      const fix = document.createElement("p");
      fix.className = "chance__detail";
      fix.textContent = `${goal.reason} `;
      const edit = document.createElement("a");
      edit.href = "#goal";
      edit.textContent = "Edit it in step 2";
      fix.append(edit, " to plan it.");
      body.append(text("p", "chance__name", goal.name), text("p", "chance__meta", `${format.money(goal.targetAmount)} · not planned`), fix);
      item.append(ring(), body);
      cards.append(item);
    }
  }

  /* sets one card's ring and number; done is false while the planner is still training */
  function setChance(item, value, done) {
    const arc = item.querySelector(".chance__arc");
    arc.setAttribute("stroke-dashoffset", String(RING * (1 - value)));
    item.querySelector(".chance__num").textContent = percent(value);
    item.classList.toggle("is-training", !done);
  }

  /* ---------- training ---------- */

  let lastChances = new Map();   // goal id -> its chance in the last finished plan

  /* The result area while the planner trains. Goals that were in the last plan keep their chance,
     marked as updating; with nothing shown before (fresh), the chart and scores stay hidden until
     this plan is done, so they aren't read as this plan's. */
  function showWorking({ goals, left, fresh, plan }) {
    $("odds-empty").hidden = true;
    $("odds-result").hidden = false;
    $("odds-result").setAttribute("aria-busy", "true");
    $("odds-announce").textContent = "";
    $("odds-reason").textContent = reason(plan, null);
    showCards(goals, left);
    $("plan-saved").hidden = true;
    if (fresh) {
      lastChances = new Map();
      $("odds-stats").hidden = true;
      $("odds-facts").hidden = true;
      $("timeline-section").hidden = true;
      clearTimeline();
    }
    for (const item of $("chance-list").querySelectorAll("[data-goal-id]")) {
      const value = lastChances.get(item.dataset.goalId);
      if (value === undefined) continue;
      setChance(item, value, false);
      item.querySelector(".status").textContent = "Updating…";
    }
  }

  /* goals: [{ goalId, pAny }] from the latest check while training, or null before the first */
  function showTraining(done, total, goals) {
    $("odds-training").hidden = false;
    $("odds-bar").style.width = total ? Math.round((100 * done) / total) + "%" : "0%";
    $("odds-training-text").textContent = total ? `Training the planner… round ${done} of ${total}` : "Training the planner…";
    if (!goals) return;
    for (const { goalId, pAny } of goals) {
      const item = $("chance-list").querySelector(`[data-goal-id="${CSS.escape(String(goalId))}"]`);
      if (item) setChance(item, pAny, false);
    }
  }

  const showTrainingError = () => {
    $("odds-training-text").textContent = "The planner hit an error. Try changing a value.";
  };

  /* ---------- the finished plan ---------- */

  /* result is a MultiGoalPlan; plan is what showWorking got */
  function showPlan(plan, result) {
    $("odds-result").setAttribute("aria-busy", "false");
    $("odds-training").hidden = true;
    $("odds-reason").textContent = reason(plan, result);

    for (const goal of plan.goals) {
      const item = $("chance-list").querySelector(`[data-goal-id="${CSS.escape(String(goal.id))}"]`);
      const r = result.goal(goal.id);
      if (!item || !r) continue;
      setChance(item, r.chance.value, true);
      item.dataset.tone = r.chance.tone;
      const status = item.querySelector(".status");
      status.className = "status status--" + r.chance.tone;
      status.textContent = r.verdict;
      item.querySelector(".chance__sr").textContent = `${r.chance.toPercent()} chance of reaching it.`;
      item.querySelector(".chance__detail").textContent = goal.minAcceptableAmount > 0 && r.partial.value > 0
        ? `${r.full.toPercent()} in full, ${r.partial.toPercent()} more at the ${format.money(goal.minAcceptableAmount)} you'd accept.`
        : "";
    }

    const best = plan.goals.reduce((sum, g) => sum + g.priority, 0);
    const score = (utility) => `${utility.toFixed(1)} of ${best}`;
    $("odds-stats").hidden = false;
    $("odds-rl").textContent = score(result.utility);
    $("odds-dp").textContent = score(result.dpUtility);
    $("odds-efficiency").textContent = result.efficiencyText();
    $("odds-facts").hidden = false;
    $("odds-glide").textContent = result.describeGlide(plan.today.getFullYear());
    $("odds-efficiency-text").textContent = result.rlEfficiency === null
      ? "As a check, an exact dynamic-programming solution of the same problem can't reach any goal either, so there's no RL efficiency to show."
      : `As a check, an exact dynamic-programming solution of the same problem scores ${score(result.dpUtility)}. The PPO planner scores ${score(result.utility)}, ${result.efficiencyText()} of that (its RL efficiency).`;

    lastChances = new Map(result.goals.map((r) => [String(r.goalId), r.chance.value]));
    const realistic = result.realisticCount();
    $("odds-announce").textContent = plan.goals.length === 1
      ? `Your chance of reaching ${plan.goals[0].name} is ${result.goals[0].chance.toPercent()}.`
      : `${realistic} of your ${plan.goals.length} goals ${realistic === 1 ? "is" : "are"} realistic.`;
  }

  /* whether the plan on screen is saved: { state: "saving" | "saved" | "failed", message }, or
     nothing when plans aren't saved (a page opened straight from disk) */
  function showSaved(saved) {
    const note = $("plan-saved");
    note.hidden = !saved;
    if (!saved) return;
    note.classList.toggle("is-error", saved.state === "failed");
    note.textContent = saved.state === "saving" ? "Saving this plan…"
      : saved.state === "saved" ? "This plan is saved."
      : `This plan couldn't be saved. ${saved.message}`;
  }

  /* ---------- money over time ---------- */

  let chart = null;   // { points, start, goals, today, stops, index }

  /* a stop's date: the goal's own date when a goal is paid there, otherwise that many months from today */
  function stopDate(stop) {
    const goal = chart.goals.find((g) => g.months === stop.month);
    return goal ? goal.date : monthFrom(chart.today, stop.month);
  }

  function readout(stop) {
    if (stop.month === 0) return `Today: ${format.money(stop.p50)} for your goals.`;
    const when = format.monthYear(stopDate(stop));
    const after = stop.goals.length ? `, after ${list(stop.goals)}` : "";
    return `${when}${after}: about ${format.money(stop.p50)} in a typical market, ${format.money(stop.p10)} in a bad one and ${format.money(stop.p90)} in a good one.`;
  }

  /* points to one stop: the guide line, the dot on the typical-market line and the readout */
  function pointAt(index) {
    if (!chart) return;
    chart.index = Math.max(0, Math.min(chart.stops.length - 1, index));
    const stop = chart.stops[chart.index];
    const box = $("timeline");
    const guide = box.querySelector(".tl-guide"), dot = box.querySelector(".tl-dot");
    guide.setAttribute("x1", stop.x);
    guide.setAttribute("x2", stop.x);
    dot.setAttribute("cx", stop.x);
    dot.setAttribute("cy", stop.y);
    guide.setAttribute("visibility", "visible");
    dot.setAttribute("visibility", "visible");
    $("timeline-readout").textContent = readout(stop);
  }

  let drawnWidth = 0;
  function drawTimeline() {
    if (!chart) return;
    const box = $("timeline");
    const width = Math.round(box.clientWidth) || 560;
    drawnWidth = width;
    const height = width < 420 ? 220 : 250;
    const built = TimelineChart.build({ ...chart, width, height });
    box.innerHTML = built.svg;
    chart.stops = built.stops;
    pointAt(chart.index ?? built.stops.length - 1);
  }

  /* points: the planner's timeline; start: the money at month 0; goals: [{ name, months, date }] */
  function showTimeline({ points, start, goals, today }) {
    chart = { points, start, goals, today, stops: [], index: null };
    $("timeline-section").hidden = false;
    drawTimeline();
    const body = $("timeline-table").tBodies[0];
    body.replaceChildren();
    for (const stop of chart.stops) {
      const row = document.createElement("tr");
      const when = stop.month === 0 ? "Today" : format.monthYear(stopDate(stop)) + (stop.goals.length ? `, after ${list(stop.goals)}` : "");
      for (const cell of [when, format.money(stop.p10), format.money(stop.p50), format.money(stop.p90)]) {
        row.append(text(row.children.length ? "td" : "th", "", cell));
      }
      row.firstChild.scope = "row";
      body.append(row);
    }
  }

  function clearTimeline() {
    chart = null;
    $("timeline").replaceChildren();
    $("timeline-readout").textContent = "";
    $("timeline-table").tBodies[0].replaceChildren();
  }

  const nearest = (x) => chart.stops.reduce((best, stop, i) => (Math.abs(stop.x - x) < Math.abs(chart.stops[best].x - x) ? i : best), 0);
  $("timeline").addEventListener("pointermove", (event) => {
    if (!chart || !chart.stops.length) return;
    pointAt(nearest(event.clientX - $("timeline").getBoundingClientRect().left));
  });
  $("timeline").addEventListener("pointerleave", () => chart && pointAt(chart.stops.length - 1));
  $("timeline").addEventListener("keydown", (event) => {
    if (!chart) return;
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const step = moves[event.key];
    pointAt(Number.isFinite(step) ? chart.index + step : step < 0 ? 0 : chart.stops.length - 1);
  });
  new ResizeObserver(() => {
    if (Math.round($("timeline").clientWidth) !== drawnWidth) drawTimeline();
  }).observe($("timeline"));

  /* ---------- what if ---------- */

  /* the slider moves the monthly saving by `delta` from `current`, from min to max (both deltas) */
  function setWhatIfRange({ current, min, max, step }) {
    const input = $("whatif-saving");
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = "0";
    input.dataset.current = String(current);
    $("whatif-min").textContent = format.money(current + min);
    $("whatif-max").textContent = format.money(current + max);
    showWhatIfValue(0);
    $("whatif-list").replaceChildren();
    $("whatif-reset").hidden = true;
  }

  function showWhatIfValue(delta) {
    const current = Number($("whatif-saving").dataset.current);
    const change = delta === 0 ? "what you save now" : `${delta > 0 ? "+" : "−"}${format.money(Math.abs(delta))}`;
    $("whatif-value").textContent = `${format.money(current + delta)} a month (${change})`;
    $("whatif-saving").setAttribute("aria-valuetext", `${format.money(current + delta)} a month, ${delta === 0 ? "what you save now" : change + " from now"}`);
    $("whatif-reset").hidden = delta === 0;
  }

  /* rows: [{ name, before, after, change }] with chances from 0 to 1 (change is after − before) */
  function showWhatIf(rows) {
    const box = $("whatif-list");
    box.replaceChildren();
    $("whatif-list").classList.remove("is-working");
    for (const { name, before, after, change } of rows) {
      const item = document.createElement("li");
      item.className = "whatif__item";
      const points = Math.round(change * 100);
      const tone = points > 0 ? "ok" : points < 0 ? "short" : "same";
      const label = points === 0 ? "No change" : `${points > 0 ? "+" : "−"}${Math.abs(points)} ${Math.abs(points) === 1 ? "point" : "points"}`;
      item.append(
        text("span", "whatif__name", name),
        text("span", "whatif__chances", `${percent(before)} → ${percent(after)}`),
        text("span", `whatif__change whatif__change--${tone}`, label),
      );
      box.append(item);
    }
  }

  const showWhatIfWorking = () => $("whatif-list").classList.add("is-working");

  /* lists the five investment portfolios, lowest risk first, in "How we got these numbers" */
  function showPortfolios(portfolios) {
    const box = $("portfolio-list");
    box.replaceChildren();
    for (const portfolio of portfolios) box.append(text("li", "", portfolio.describe()));
  }

  D.views.odds = {
    showEmpty, showWorking, showTraining, showTrainingError, showPlan, showSaved,
    showTimeline, clearTimeline,
    setWhatIfRange, showWhatIfValue, showWhatIf, showWhatIfWorking,
    showPortfolios,
  };
})(window.Dreamimin);
