/* ============================================================
   Step navigation: shows one step at a time (Your money, Your
   goal, Your chances), keeps the step bar and the URL hash in
   step, and animates the chance ring. Listens for the plan:*
   events app.js sends; doesn't touch the domain classes.
   ============================================================ */

(function () {
  "use strict";

  const STEPS = ["money", "goal", "chances"];
  const RING_LENGTH = 2 * Math.PI * 52;   // circumference of the ring's r=52 circle
  const COUNT_MS = 900;                   // how long the percent counts up after training

  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const shortDate = (text) => FinancialGoal.parseDate(text).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  const links = [...document.querySelectorAll(".step")];
  const panels = [...document.querySelectorAll(".panel")];
  const indicator = document.querySelector(".steps__indicator");
  const arc = $("odds-arc");
  const ring = $("odds-ring");

  let current = null, countFrame = null, shown = 0;

  /* ---------- switching steps ---------- */

  function stepFromHash() {
    const name = location.hash.slice(1);
    return STEPS.includes(name) ? name : "money";
  }

  function moveIndicator(link) {
    indicator.style.transform = `translateX(${link.offsetLeft}px)`;
    indicator.style.width = link.offsetWidth + "px";
  }

  function show(name, { focus = true } = {}) {
    if (name === current) return;
    const forward = current === null || STEPS.indexOf(name) > STEPS.indexOf(current);
    current = name;

    links.forEach((link) => {
      const active = link.dataset.step === name;
      if (active) { link.setAttribute("aria-current", "step"); moveIndicator(link); }
      else link.removeAttribute("aria-current");
    });

    panels.forEach((panel) => {
      const active = panel.dataset.step === name;
      panel.hidden = !active;
      panel.classList.remove("is-forward", "is-back");
      if (active) {
        void panel.offsetWidth;   // restart the enter animation
        panel.classList.add(forward ? "is-forward" : "is-back");
      }
    });

    if (focus) {
      window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
      document.querySelector(`#panel-${name} h2[tabindex]`)?.focus({ preventScroll: true });
    }
  }

  window.addEventListener("hashchange", () => show(stepFromHash()));
  /* step widths change with the window and when the web fonts arrive */
  const remeasure = () => {
    const link = links.find((l) => l.dataset.step === current);
    if (link) moveIndicator(link);
  };
  window.addEventListener("resize", remeasure);
  document.fonts?.ready.then(remeasure);

  /* ---------- step bar and summary ---------- */

  document.addEventListener("plan:update", ({ detail: { profile, goal } }) => {
    const done = { money: Boolean(profile), goal: Boolean(goal) };
    links.forEach((link) => link.classList.toggle("is-done", Boolean(done[link.dataset.step])));

    const flow = profile ? profile.monthlyCashFlow : null;
    $("step-money-meta").textContent = profile ? `${flow < 0 ? "−" : "+"}${money.format(Math.abs(flow))}/mo` : "";
    $("step-goal-meta").textContent = goal ? goal.name : "";

    $("plan-summary").hidden = !(profile && goal);
    if (profile && goal) {
      $("sum-income").textContent = money.format(profile.income);
      $("sum-expenses").textContent = money.format(profile.expenses);
      $("sum-goal").textContent = `${goal.name}, ${money.format(goal.targetAmount)} by ${shortDate(goal.targetDate)}`;
    }
  });

  /* ---------- chance ring ---------- */

  function setArc(value, tone) {
    arc.style.strokeDashoffset = RING_LENGTH * (1 - value);
    ring.dataset.tone = tone;
  }

  /* counts the percent up from what is showing to the final value, then shows the exact text */
  function countTo(value, text) {
    cancelAnimationFrame(countFrame);
    const from = shown, start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      $("odds-prob").textContent = Math.round((from + (value - from) * eased) * 100) + "%";
      if (t < 1) countFrame = requestAnimationFrame(tick);
      else $("odds-prob").textContent = text;
    };
    if (reducedMotion.matches) $("odds-prob").textContent = text;
    else countFrame = requestAnimationFrame(tick);
    shown = value;
  }

  document.addEventListener("plan:progress", ({ detail: { prob } }) => {
    cancelAnimationFrame(countFrame);
    ring.classList.add("is-training");
    if (prob !== null && prob !== undefined) { setArc(prob, "mid"); shown = prob; }
    $("step-chances-meta").textContent = "";
  });

  document.addEventListener("plan:result", ({ detail: { value, text, tone } }) => {
    ring.classList.remove("is-training");
    setArc(value, tone);
    countTo(value, text);
    $("step-chances-meta").textContent = text;
  });

  document.addEventListener("plan:empty", () => {
    cancelAnimationFrame(countFrame);
    ring.classList.remove("is-training");
    setArc(0, "mid");
    shown = 0;
    $("step-chances-meta").textContent = "";
  });

  arc.style.strokeDasharray = RING_LENGTH;
  arc.style.strokeDashoffset = RING_LENGTH;
  show(stepFromHash(), { focus: false });
})();
