/* ============================================================
   Step navigation view: shows one step at a time (Your money,
   Your goals, Your chances), keeps the step bar and the URL hash
   in step, and shows a short summary under each step. Listens
   for the plan:* events the controllers send; doesn't change
   any data.
   ============================================================ */

(function (D) {
  "use strict";

  const STEPS = ["money", "goal", "chances"];

  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const { format } = D;

  const links = [...document.querySelectorAll(".step")];
  const panels = [...document.querySelectorAll(".panel")];
  const indicator = document.querySelector(".steps__indicator");

  let current = null;

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

  /* goal is the selected FinancialGoal (or null); goalCount is how many goals there are */
  document.addEventListener("plan:update", ({ detail: { profile, goal, goalCount } }) => {
    const done = { money: Boolean(profile), goal: Boolean(goal) };
    links.forEach((link) => link.classList.toggle("is-done", Boolean(done[link.dataset.step])));

    const flow = profile ? profile.monthlyCashFlow : null;
    $("step-money-meta").textContent = profile ? `${flow < 0 ? "−" : "+"}${format.money(Math.abs(flow))}/mo` : "";
    $("step-goal-meta").textContent = goalCount ? format.plural(goalCount, "goal") : "";

    $("plan-summary").hidden = !(profile && goalCount);
    if (profile && goalCount) {
      $("sum-income").textContent = format.money(profile.income);
      $("sum-expenses").textContent = format.money(profile.expenses);
      $("sum-goals").textContent = String(goalCount);
    }
  });

  /* ---------- chances ---------- */

  /* text: the one goal's chance ("72%"), or how many goals are realistic ("2 of 3 realistic") */
  document.addEventListener("plan:progress", () => { $("step-chances-meta").textContent = ""; });
  document.addEventListener("plan:result", ({ detail: { text } }) => { $("step-chances-meta").textContent = text; });
  document.addEventListener("plan:empty", () => { $("step-chances-meta").textContent = ""; });

  show(stepFromHash(), { focus: false });
})(window.Dreamimin);
