/* ============================================================
   Page logic: reads the form, builds a FinancialProfile and a
   FinancialGoal from it, and shows what they work out.
   ============================================================ */

(function () {
  "use strict";

  /* each input: which class it feeds, the property it becomes, and how it is read */
  const FIELDS = {
    income: { group: "profile", key: "income", kind: "money", missing: "Enter your monthly income." },
    expenses: { group: "profile", key: "expenses", kind: "money", missing: "Enter your monthly spending." },
    netWorth: { group: "profile", key: "netWorth", kind: "money", optional: true },
    goalName: { group: "goal", key: "name", kind: "text", missing: "Give your goal a name." },
    goalAmount: { group: "goal", key: "targetAmount", kind: "money", missing: "Enter how much you need." },
    goalDate: { group: "goal", key: "targetDate", kind: "date", missing: "Choose a target date." },
  };
  const CLASSES = { profile: FinancialProfile, goal: FinancialGoal };

  const form = document.getElementById("plan-form");
  const touched = new Set();
  const $ = (id) => document.getElementById(id);

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  const longDate = (date) => date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const monthYear = (date) => date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const signed = (n) => (n < 0 ? "−" : "") + money.format(Math.abs(n));

  const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
  const ICON_SHORT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>';

  /* "$4,500" -> 4500; empty -> null; anything else that isn't a number -> NaN */
  function parseAmount(text) {
    const cleaned = text.replace(/[\s,$]/g, "");
    if (cleaned === "") return null;
    return /^-?\d*\.?\d+$/.test(cleaned) ? Number(cleaned) : NaN;
  }

  function readValue(name) {
    const raw = form.elements[name].value;
    if (FIELDS[name].kind === "money") return parseAmount(raw);
    return raw.trim() === "" ? null : raw;
  }

  /* values and error messages for one class's inputs; values are null where something is missing */
  function readGroup(group) {
    const names = Object.keys(FIELDS).filter((name) => FIELDS[name].group === group);
    const values = {}, errors = {};
    let started = false;
    for (const name of names) {
      const { key, missing, optional } = FIELDS[name];
      const value = readValue(name);
      if (value !== null) started = true;
      if (value === null && !optional) errors[name] = missing;
      values[key] = value === null && optional ? 0 : value;
    }
    const checked = CLASSES[group].validate(values);
    for (const name of names) {
      if (!errors[name] && checked[FIELDS[name].key]) errors[name] = checked[FIELDS[name].key];
    }
    return { values, errors: errors, started, valid: Object.keys(errors).length === 0 };
  }

  /* errors only show once a field has been left, so nothing turns red while typing */
  function showErrors(errors) {
    for (const name of Object.keys(FIELDS)) {
      const message = touched.has(name) ? errors[name] || "" : "";
      $(name + "-error").textContent = message;
      form.elements[name].setAttribute("aria-invalid", message ? "true" : "false");
      form.elements[name].closest(".field").classList.toggle("has-error", Boolean(message));
    }
  }

  function showMoney(profile) {
    $("money-empty").hidden = Boolean(profile);
    $("money-result").hidden = !profile;
    if (!profile) return;

    const result = $("money-result");
    const flow = profile.monthlyCashFlow;
    const ratePct = Math.round(profile.savingsRate * 100);
    result.classList.toggle("is-positive", flow > 0);
    result.classList.toggle("is-negative", flow < 0);

    $("cashflow-value").textContent = (flow > 0 ? "+" : "") + signed(flow);
    $("cashflow-label").textContent = flow < 0 ? "more going out than coming in" : "left over each month";

    $("rate-value").textContent = profile.income > 0 ? (ratePct < 0 ? "−" + -ratePct : ratePct) + "%" : "–";
    $("rate-fill").style.width = Math.max(0, Math.min(100, ratePct)) + "%";
    $("rate-meter").setAttribute("aria-label", "Savings rate " + (profile.income > 0 ? ratePct + "%" : "not available"));

    let summary;
    if (profile.income === 0) summary = "With no income entered, there's no savings rate to show yet.";
    else if (flow > 0) summary = `You keep ${money.format(flow)} of every ${money.format(profile.income)} you earn. That's ${money.format(flow * 12)} a year.`;
    else if (flow === 0) summary = "You spend exactly what you earn, so nothing is left to save.";
    else summary = `You spend ${money.format(-flow)} more than you earn each month. That gap comes out of savings or adds to debt.`;
    $("summary").textContent = summary;

    $("stat-income").textContent = money.format(profile.income);
    $("stat-expenses").textContent = money.format(profile.expenses);
    $("stat-networth").textContent = signed(profile.netWorth);
  }

  function showGoal(profile, goal) {
    const ready = Boolean(profile && goal);
    $("goal-empty").hidden = ready;
    $("goal-result").hidden = !ready;
    if (!ready) {
      $("goal-empty-text").textContent = goal
        ? "Now add your monthly income and spending to check this goal."
        : "Add your goal's name, amount and date to see if you can reach it.";
      return;
    }

    const card = document.querySelector(".goal-card");
    const needed = goal.monthlySavingsRequired();
    const have = profile.monthlyCashFlow;
    const onTrack = goal.isOnTrack(have);
    const months = goal.monthsRemaining();
    card.classList.toggle("is-short", !onTrack);

    $("goal-name").textContent = goal.name;
    $("goal-target").textContent = `${money.format(goal.targetAmount)} by ${longDate(FinancialGoal.parseDate(goal.targetDate))}`;
    $("goal-status").className = "status " + (onTrack ? "status--ok" : "status--short");
    $("goal-status").innerHTML = (onTrack ? ICON_OK : ICON_SHORT) + `<span>${onTrack ? "On track" : "Not on track yet"}</span>`;

    $("goal-needed").textContent = money.format(Math.ceil(needed));
    $("goal-have").textContent = signed(have);

    const coverage = have > 0 ? Math.min(100, Math.round((have / needed) * 100)) : 0;
    $("goal-fill").style.width = coverage + "%";
    $("goal-meter").setAttribute("aria-label", `Your monthly surplus covers ${coverage}% of what this goal needs`);
    $("goal-coverage").textContent = `Your surplus covers ${coverage}% of what this goal needs each month.`;

    let advice;
    const reachBy = (n) => monthYear(new Date(new Date().getFullYear(), new Date().getMonth() + n, 1));
    if (onTrack) {
      const n = goal.monthsToReach(have);
      advice = `Putting ${money.format(have)} a month toward it, you'd reach ${money.format(goal.targetAmount)} in ${n} month${n === 1 ? "" : "s"}, around ${reachBy(n)}.`;
    } else if (have <= 0) {
      advice = "Nothing is left over each month right now, so there's no money to put toward this goal. Spending less or earning more is the first step.";
    } else {
      const gap = Math.ceil(needed - have);
      const n = goal.monthsToReach(have);
      advice = `You'd need ${money.format(gap)} more a month to make it in ${months} month${months === 1 ? "" : "s"}. At your current pace you'd get there around ${reachBy(n)} instead.`;
    }
    $("goal-advice").textContent = advice;
  }

  function update() {
    const profileInput = readGroup("profile");
    const goalInput = readGroup("goal");
    showErrors({ ...profileInput.errors, ...goalInput.errors });
    const profile = profileInput.valid ? new FinancialProfile(profileInput.values) : null;
    const goal = goalInput.valid ? new FinancialGoal(goalInput.values) : null;
    showMoney(profile);
    showGoal(profile, goal);
  }

  /* the earliest date the picker allows is tomorrow */
  function setMinDate() {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const pad = (n) => String(n).padStart(2, "0");
    form.elements.goalDate.min = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);

  /* on leaving a field: mark it touched and tidy money amounts, e.g. 4500 -> 4,500 */
  form.addEventListener("focusout", (event) => {
    const input = event.target;
    if (!(input.name in FIELDS)) return;
    touched.add(input.name);
    if (FIELDS[input.name].kind === "money") {
      const value = parseAmount(input.value);
      if (value !== null && !Number.isNaN(value)) input.value = plain.format(value);
    }
    update();
  });

  form.addEventListener("reset", () => {
    touched.clear();
    setTimeout(update);   // after the browser has cleared the fields
  });

  form.addEventListener("submit", (event) => event.preventDefault());

  setMinDate();
  update();
})();
