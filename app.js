/* ============================================================
   COGNIFI — interface
   State lives in one object, is saved to this browser, and every
   change re-runs the planner (engine.js) and redraws the views.
   ============================================================ */

(function () {
  "use strict";

  const E = window.Engine;
  const BASE = E.BASE_YEAR;
  const KEY = "atco-state-v2";
  /* in the order a person works through them: what you have, what you want, your limits, then what we find */
  const VIEWS = ["picture", "goals", "beliefs", "plan", "odds", "retirement", "ledger"];
  const VIEW_NAMES = { picture: "The Picture", goals: "The Goals", beliefs: "Beliefs", plan: "The Plan", odds: "The Odds", retirement: "Retirement", ledger: "The Ledger" };
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DECISION = { 1: "Fund in full", 2: "Fund the smaller version", 0: "Set aside for now" };
  const TOL_DESC = [
    "Mostly bonds and cash. Small swings and slow growth.",
    "More bonds than stocks. A bad year hurts, but not for long.",
    "About 60% stocks and 40% bonds. The usual middle ground.",
    "Mostly stocks. Real drops along the way, and more growth over time.",
    "All stocks. The biggest swings and the highest expected return.",
  ];

  const EXAMPLE = {
    picture: { networth: 35000, income: 82000, expenses: 60000, invest: 1500, age: 27 },
    goals: [
      { id: "g1", name: "A down payment on a first home", cost: 90000, year: BASE + 5, month: 5, importance: 9, partial: 60000, color: 0 },
      { id: "g2", name: "A year of graduate school", cost: 40000, year: BASE + 2, month: 8, importance: 6, partial: 25000, color: 1 },
      { id: "g3", name: "A wedding", cost: 30000, year: BASE + 3, month: 4, importance: 7, partial: 18000, color: 2 },
      { id: "g4", name: "A sabbatical in Europe", cost: 20000, year: BASE + 8, month: 3, importance: 4, partial: 0, color: 3 },
    ],
    retirement: {
      enabled: true, age: 62, lifeExp: 95, spending: 45000, importance: 10,
      trad: 15000, roth: 8000, taxable: 12000, cTrad: 9000, cRoth: 6000, cTaxable: 7000,
      annuityOn: false, annuityAmt: 250000, mode: "income",
    },
    beliefs: { tolerance: 2, esg: false },
    extraMonthly: 0,
    cashflows: [],
    focus: "g1",
    period: "year",
  };

  /* what a first visit starts from: every field empty until the person fills it in */
  const BLANK = {
    picture: { networth: 0, income: 0, expenses: 0, invest: 0, age: 0 },
    goals: [],
    retirement: {
      enabled: false, age: 0, lifeExp: 0, spending: 0, importance: 10,
      trad: 0, roth: 0, taxable: 0, cTrad: 0, cRoth: 0, cTaxable: 0,
      annuityOn: false, annuityAmt: 0, mode: "income",
    },
    beliefs: { tolerance: 2, esg: false },
    extraMonthly: 0,
    cashflows: [],
    focus: null,
    period: "year",
  };

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const money = (n) => (n < 0 ? "−" : "") + usd.format(Math.abs(Math.round(n)));
  const compact = (n) => {
    const s = n < 0 ? "−" : ""; n = Math.abs(n);
    if (n >= 1e6) return s + "$" + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return s + "$" + Math.round(n / 1e3) + "k";
    return s + "$" + Math.round(n);
  };
  const pct = (p) => Math.round(p * 100) + "%";
  const parseNum = (str) => { const n = parseFloat(String(str).replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : 0; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const getPath = (o, path) => path.split(".").reduce((a, k) => a[k], o);
  const setPath = (o, path, v) => { const ks = path.split("."); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  const yearsAway = (n) => (n <= 0 ? "this year" : n === 1 ? "in 1 year" : "in " + n + " years");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* every money flow is shown, and typed, per the one period the person picks */
  const PERIODS = {
    year:   { n: 1,  short: "yr",   word: "a year",          col: "per year" },
    month:  { n: 12, short: "mo",   word: "a month",         col: "per month" },
    biweek: { n: 26, short: "2 wk", word: "every two weeks", col: "per two weeks" },
  };
  const period = () => PERIODS[state.period] || PERIODS.year;
  const per = (yearly) => yearly / period().n;
  const flow = (yearly, fmt = money) => fmt(per(yearly)) + " " + period().word;
  /* bound fields keep their stored unit (data-flow="yr" or "mo"); what's typed is per the chosen period */
  const shownFlow = (v, unit) => Math.round(per(unit === "mo" ? v * 12 : v));
  const storedFlow = (v, unit) => { const yearly = v * period().n; return unit === "mo" ? yearly / 12 : yearly; };

  function verdict(p) {
    if (p >= 0.8) return { band: "good", chip: "Comfortably within reach", read: "Almost every future gets you there. On this plan, the goal is realistic, with room to spare." };
    if (p >= 0.6) return { band: "good", chip: "A realistic goal", read: "Most futures get you there in time. Keep going as you are and the odds are with you." };
    if (p >= 0.4) return { band: "mid", chip: "A stretch", read: "It could go either way. Saving a little more, or waiting a year longer, would help." };
    if (p >= 0.2) return { band: "mid", chip: "A long shot as planned", read: "The odds are against you. A lower cost, a later date or more savings each year would help." };
    return { band: "poor", chip: "Unlikely on this plan", read: "Very few futures get there in time. Something needs to change for this goal to be realistic." };
  }

  /* ---------- state ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const d = clone(BLANK);
      return {
        ...d, ...s,
        picture: { ...d.picture, ...s.picture },
        retirement: { ...d.retirement, ...s.retirement },
        beliefs: { ...d.beliefs, ...s.beliefs },
        goals: Array.isArray(s.goals) ? s.goals : d.goals,
        cashflows: Array.isArray(s.cashflows) ? s.cashflows : [],
      };
    } catch (_) { return null; }
  }
  let state = load() || clone(BLANK);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} };

  /* ---------- the model handed to the engine ---------- */
  const weight = (importance) => Math.pow(2, importance / 2);

  function buildModel(s) {
    const pic = s.picture;
    const age = clamp(Math.round(pic.age) || 30, 16, 100);
    const savings = (pic.invest + s.extraMonthly) * 12;
    /* a goal due later this year can use the savings made before its month */
    const nowMonth = new Date().getMonth();
    const list = s.goals.map((g) => ({ ...g, kind: "goal", idx: g.year - BASE, at: g.year === BASE ? Math.max(0, (g.month - nowMonth) / 12) : 0 }));
    let retireIdx = Infinity;
    if (s.retirement.enabled) {
      const idx = Math.round(s.retirement.age) - age;
      if (idx >= 1 && idx <= E.MAX_YEARS) {
        retireIdx = idx;
        list.push({
          id: "retire", kind: "retire", name: s.retirement.label || "Retire at " + Math.round(s.retirement.age),
          cost: 25 * s.retirement.spending, partial: 0, importance: s.retirement.importance,
          year: BASE + idx, month: 0, idx, color: "r",
        });
      }
    }
    const goals = list.filter((g) => g.idx >= 0 && g.idx <= E.MAX_YEARS && g.cost > 0);
    const cash = new Float64Array(E.MAX_YEARS);
    s.cashflows.forEach((c) => { const t = c.year - BASE; if (t >= 0 && t < E.MAX_YEARS) cash[t] += c.amount; });
    const horizon = goals.reduce((m, g) => Math.max(m, g.idx), 1);
    return {
      goals, savings, age, horizon,
      base: {
        w0: pic.networth, savings, retireIdx, cash, esg: s.beliefs.esg, horizon,
        /* each point of importance counts ~1.4x the one below it, so priorities really lead */
        goals: goals.map((g) => ({ idx: g.idx, at: g.at || 0, cost: g.cost, partial: Math.min(g.partial || 0, g.cost), importance: weight(g.importance) })),
      },
    };
  }

  function planFor(s) {
    const m = buildModel(s);
    if (!m.goals.length) return { m, plan: null };
    return { m, plan: E.optimize(m.base, s.beliefs.tolerance) };
  }

  /* the ages the retirement math uses, with stand-ins while the fields are still empty */
  function retireAges(s) {
    const age = clamp(Math.round(s.picture.age) || 30, 16, 100);
    const retireAge = clamp(Math.round(s.retirement.age) || 65, age, 100);
    return { age, retireAge, lifeExp: clamp(Math.round(s.retirement.lifeExp) || 95, retireAge + 1, 110) };
  }

  function retirementFor(s, level) {
    const r = s.retirement;
    const accMu = E.portfolio(level, s.beliefs.esg).mu;
    const drawMu = E.portfolio(Math.min(level, 2), s.beliefs.esg).mu;
    return E.retirement({
      ...retireAges(s),
      spending: r.spending, trad: r.trad, roth: r.roth, taxable: r.taxable,
      cTrad: r.cTrad, cRoth: r.cRoth, cTaxable: r.cTaxable,
      accReturn: accMu, drawReturn: drawMu,
      annuityOn: r.annuityOn, annuityAmt: r.annuityAmt, mode: r.mode,
    });
  }

  function compute(s) {
    const { m, plan } = planFor(s);
    const c = { m, plan };
    if (plan) {
      /* the slider compares against the plan you'd have without the extra savings */
      if (s.extraMonthly > 0) c.base0 = planFor({ ...s, extraMonthly: 0 });
      c.alone = m.goals.map((_, i) => E.standalone(m.base, i, plan.level));
      /* the plan's own level reuses the plan's result, so its numbers match every other page */
      c.byLevel = plan.byLevel;
    }
    c.ret = retirementFor(s, plan ? plan.level : s.beliefs.tolerance);
    return c;
  }

  /* suggested yearly set-aside per goal: current wealth goes to the earliest goals first, and the
     rest is saved at the start of each year (as the planner assumes) until the goal or retirement */
  function earmarks(goals, decisions, w0, r, retireIdx) {
    const out = new Array(goals.length).fill(0);
    let left = Math.max(0, w0);
    goals.map((g, i) => i).sort((a, b) => goals[a].idx - goals[b].idx).forEach((i) => {
      const g = goals[i], d = decisions[i];
      const amt = d === 1 ? g.cost : d === 2 ? g.partial : 0;
      if (!amt) return;
      const grow = Math.pow(1 + r, g.idx);
      const use = Math.min(left, amt / grow);
      left -= use;
      const need = amt - use * grow;
      let f = g.idx === 0 ? g.at || 0 : 0;   // a goal this year: the share of a year left to save
      for (let u = 0; u < Math.min(g.idx, retireIdx); u++) f += Math.pow(1 + r, g.idx - u);
      out[i] = need <= 0 ? 0 : f > 0 ? need / f : need;
    });
    return out;
  }

  /* ---------- recompute (debounced) ---------- */
  let C = null, timer = null, currentView = "picture";
  const pill = $("#status-pill");
  function schedule(delay = 140) {
    pill.textContent = "Recalculating…";
    document.body.classList.add("is-busy");
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }
  function commit(delay) { save(); schedule(delay); }

  /* how long the planner and redraw took, shown in the pill once it's done */
  const took = (ms) => (ms < 1000 ? Math.max(1, Math.round(ms)) + " ms" : (ms / 1000).toFixed(1) + " s");

  function run() {
    const t0 = performance.now();
    C = compute(state);
    renderAll();
    pill.textContent = C.plan ? "Up to date · " + took(performance.now() - t0) : "Add a goal to start";
    document.body.classList.remove("is-busy");
    syncRanges();
  }

  /* sliders fill up to the thumb, so it's clear how far along they are */
  function syncRange(r) {
    const span = (+r.max || 100) - (+r.min || 0);
    r.style.setProperty("--fill", (span ? ((+r.value - (+r.min || 0)) / span) * 100 : 0) + "%");
  }
  function syncRanges() { $$(".range").forEach(syncRange); }
  document.addEventListener("input", (e) => { if (e.target.classList && e.target.classList.contains("range")) syncRange(e.target); });

  /* ============================================================
     RENDER
     ============================================================ */
  function renderAll() {
    renderPicture();
    renderGoalList();
    renderVerdict();
    renderGoals();
    renderPlan();
    renderBeliefs();
    renderOdds();
    renderRetirement();
    renderLedger();
    renderCharts(currentView);
  }

  function renderCharts(v) {
    if (!C) return;
    if (v === "goals") renderTimeline();
    if (v === "odds") renderFan();
    if (v === "retirement") renderRetChart();
  }

  /* square-root time: the next few years get more room than the distant ones */
  const timeScale = (years, span) => Math.sqrt(clamp(years / span, 0, 1));
  /* readable year ticks on that scale, dropping any that would crowd their neighbour */
  function yearTicks(span, px, minGap) {
    const out = [];
    [0, 1, 2, 3, 5, 8, 12, 18, 25, 35, 45, 60].filter((k) => k <= span).concat(span).forEach((k) => {
      if (!out.length || px(k) - px(out[out.length - 1]) >= minGap) out.push(k);
      else if (k === span) out[out.length - 1] = k;
    });
    return out;
  }

  const goalColor = (g) => (g.color === "r" ? "var(--g-r)" : "var(--g" + (g.color % 6) + ")");
  const goalById = (id) => (C && C.plan ? C.m.goals.findIndex((g) => g.id === id) : -1);
  /* the odds that match the plan's aim: when it aims for the smaller version, that's the chance shown */
  const oddsOf = (res, d, i) => (d === 2 ? res.pPart[i] : res.pFull[i]);

  /* ---------- I. THE PICTURE ---------- */
  let shownPct = 0, countRAF = null;
  function animatePct(el, target) {
    if (countRAF) cancelAnimationFrame(countRAF);
    if (reduceMotion) { shownPct = target; el.textContent = target + "%"; return; }
    const from = shownPct, start = performance.now();
    const tick = (now) => {
      const k = clamp((now - start) / 650, 0, 1), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (target - from) * e) + "%";
      if (k < 1) countRAF = requestAnimationFrame(tick); else shownPct = target;
    };
    countRAF = requestAnimationFrame(tick);
  }

  /* what we can tell from the four numbers alone, before any goals */
  function renderPicture() {
    const pic = state.picture, sv = pic.invest * 12, left = pic.income - pic.expenses;
    const rate = pic.income > 0 ? sv / pic.income : 0;
    $("#savings-figure").textContent = money(per(sv));
    $("#savings-unit").textContent = " invested " + period().word;
    $("#savings-rate").textContent = pic.income > 0 ? pct(rate) : "—";
    $("#savings-meter").style.width = clamp(rate / 0.4, 0, 1) * 100 + "%";
    const base = sv <= 0
      ? "Nothing goes in, so goals can only be paid from what you already have."
      : rate >= 0.15
        ? "Above the 15% that's commonly suggested. That gives your goals a solid base."
        : "Below the 15% that's commonly suggested. Small increases add up, and you can test one on The Plan.";
    const gap = left - sv;
    $("#savings-note").textContent = base + (gap < -1
      ? ` That's ${flow(-gap)} more than you have left after expenses, so it may be hard to keep up.`
      : gap > 1 ? ` Another ${flow(gap)} is left over and not invested.` : "");

    const months = pic.expenses > 0 ? pic.networth / (pic.expenses / 12) : Infinity;
    $("#cushion-figure").textContent = !isFinite(months) ? "—" : months < 1 ? "Under a month" : Math.floor(months) + (Math.floor(months) === 1 ? " month" : " months");
    $("#cushion-note").textContent = !isFinite(months) ? "" : months >= 6
      ? "More than the 3 to 6 months people usually keep for emergencies."
      : months >= 3
        ? "Within the 3 to 6 months people usually keep for emergencies."
        : "Less than the 3 to 6 months people usually keep for emergencies. Worth building up alongside your goals.";
  }

  /* ---------- IV. THE PLAN: the odds dial ---------- */
  function renderVerdict() {
    $("#sim-count").textContent = E.FULL_PATHS.toLocaleString("en-US");

    const sel = $("#focus-goal");
    const fill = $(".seal__fill"), CIRC = 2 * Math.PI * 118;
    if (!C.plan) {
      sel.innerHTML = "<option>No goals yet</option>"; sel.disabled = true;
      $("#prob-value").textContent = "—";
      fill.style.strokeDashoffset = CIRC;
      $("#verdict-chip").textContent = "Add a goal to begin";
      $("#verdict-chip").dataset.band = "";
      $("#verdict-read").innerHTML = 'Your odds appear here once there is something to aim for. <a href="#goals">Add a goal</a>.';
      $("#mini-goals").innerHTML = "";
      return;
    }
    sel.disabled = false;
    const goals = C.m.goals, res = C.plan.result;
    let i = goalById(state.focus);
    if (i < 0) { i = goals.reduce((b, g, j) => (g.importance > goals[b].importance ? j : b), 0); state.focus = goals[i].id; }
    sel.innerHTML = goals.map((g) => `<option value="${esc(g.id)}"${g.id === state.focus ? " selected" : ""}>Odds for: ${esc(g.name)}</option>`).join("");

    const g = goals[i], d = C.plan.decisions[i], skipped = d === 0;
    const p = skipped ? C.alone[i] : oddsOf(res, d, i);
    animatePct($("#prob-value"), Math.round(p * 100));
    fill.style.strokeDashoffset = CIRC * (1 - p);
    fill.style.stroke = skipped ? "var(--ink-faint)" : p >= 0.6 ? "var(--brass)" : p >= 0.4 ? "var(--mid)" : "var(--poor)";

    const v = verdict(p), chip = $("#verdict-chip");
    if (skipped) {
      chip.textContent = "Set aside by the plan"; chip.dataset.band = "";
      $("#verdict-read").textContent = `To fund goals that matter more to you, the plan skips this one. On its own it would have a ${pct(p)} chance.`;
    } else {
      chip.textContent = v.chip; chip.dataset.band = v.band;
      const note = d === 2
        ? ` To leave room for goals you weigh more, the plan usually goes for the smaller version (${compact(g.partial)}) instead of the full ${compact(g.cost)}${res.pFull[i] > 0.005 ? `, and pays the full cost in another ${pct(res.pFull[i])} of futures` : ""}.`
        : res.pPart[i] > 0.005 ? ` In another ${pct(res.pPart[i])} of futures you can afford the smaller version (${compact(g.partial)}).` : "";
      $("#verdict-read").textContent = v.read + note;
    }

    /* money on hand that year vs the cost */
    const k = g.idx, f = res.fan;
    const axisMax = Math.max(g.cost, f.p90[k], 1) * 1.12, x = (val) => clamp((val / axisMax) * 100, 0, 100);
    $("#dist-band").style.left = x(f.p10[k]) + "%";
    $("#dist-band").style.width = Math.max(1.5, x(f.p90[k]) - x(f.p10[k])) + "%";
    $("#dist-median").style.left = x(f.p50[k]) + "%";
    $("#dist-median span").textContent = "likely " + compact(f.p50[k]);
    $("#dist-goal").style.left = x(g.cost) + "%";
    $("#dist-goal-label").textContent = "cost " + compact(g.cost);
    $("#dist-year").textContent = g.year;
    $("#dist-max").textContent = compact(axisMax);

    $("#mini-goals").innerHTML = goals.map((gg, j) => {
      const sk = C.plan.decisions[j] === 0, pj = oddsOf(res, C.plan.decisions[j], j);
      return `<li class="${sk ? "is-skipped" : ""}" style="--gc:${goalColor(gg)}">
        <span class="mini__dot" aria-hidden="true"></span>
        <span class="mini__name">${esc(gg.name)}</span>
        <span class="mini__bar" aria-hidden="true"><span style="width:${sk ? 0 : pj * 100}%"></span></span>
        <span class="mini__pct">${sk ? "set aside" : pct(pj)}</span></li>`;
    }).join("");
  }

  /* ---------- II. THE GOALS ---------- */
  function renderGoals() {
    syncExtra();
    const wrap = $("#goal-cards");
    if (!C.plan) {
      wrap.innerHTML = `<div class="empty panel"><p class="empty__title">Nothing to plan yet.</p><p class="section-note"><a href="#goals">Add a goal</a>, or turn on retirement under No. VI.</p></div>`;
      return;
    }
    const goals = C.m.goals, res = C.plan.result;
    const order = goals.map((g, i) => i).sort((a, b) => goals[a].idx - goals[b].idx || goals[a].month - goals[b].month);
    wrap.innerHTML = order.map((i) => {
      const g = goals[i], d = C.plan.decisions[i], skipped = d === 0;
      const p = skipped ? C.alone[i] : oddsOf(res, d, i);
      const v = verdict(p);
      let delta = null, changed = "";
      const b = C.base0 && C.base0.plan, bi = b ? C.base0.m.goals.findIndex((x) => x.id === g.id) : -1;
      if (!skipped && bi >= 0) {
        const bd = b.decisions[bi];
        delta = Math.round((p - (bd === 0 ? 0 : oddsOf(b.result, bd, bi))) * 100);
        if (bd !== d) changed = d === 1 ? "now in full" : "now the smaller version";
      }
      const isRet = g.kind === "retire";
      const due = isRet ? `${g.year} · ${yearsAway(g.idx)}` : `${MONTHS[g.month]} ${g.year} · ${yearsAway(g.idx)}`;
      const dots = Array.from({ length: 10 }, (_, k) => `<i class="${k < g.importance ? "on" : ""}"></i>`).join("");
      const partW = d === 1 ? res.pPart[i] * 100 : 0;
      return `<article class="card${skipped ? " is-skipped" : ""}" style="--gc:${goalColor(g)}" data-id="${esc(g.id)}">
        <div class="card__top">
          <span class="card__due">${due}</span>
          <span class="card__weight" role="img" aria-label="Importance ${g.importance} of 10">${dots}</span>
        </div>
        <h3 class="card__name">${esc(g.name)}</h3>
        <p class="card__cost">${money(g.cost)}${g.partial > 0 ? ` <span>· would accept ${compact(g.partial)}</span>` : ""}${isRet ? " <span>· 25 years of spending</span>" : ""}</p>
        <div class="card__odds">
          <span class="card__pct">${pct(p)}</span>
          ${delta !== null && (delta !== 0 || changed) ? `<span class="card__delta${delta < 0 ? " is-down" : ""}">${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)} pts${changed ? ` · ${changed}` : ""}</span>` : ""}
        </div>
        <div class="card__bar" aria-hidden="true"><span style="width:${p * 100}%"></span><span class="card__bar-part" style="left:${p * 100}%;width:${partW}%"></span></div>
        <p class="card__verdict" data-band="${skipped ? "" : v.band}">${skipped ? "Chance if pursued alone" : d === 2 ? `${v.chip}, at ${compact(g.partial)}` : v.chip}</p>
        <p class="card__plan"><span class="tag tag--d${d}">${DECISION[d]}</span>${partW >= 0.5 ? `<span class="card__partnote">plus ${Math.round(partW)}% for the smaller version</span>` : ""}</p>
        <div class="card__actions">
          ${isRet
            ? `<a class="link-btn" href="#retirement">Edit retirement</a><button type="button" class="link-btn" data-act="extend">Retire a year later</button>`
            : `<button type="button" class="link-btn" data-act="extend">Push back a year</button><button type="button" class="link-btn" data-act="edit">Edit goal</button>`}
        </div>
      </article>`;
    }).join("");
  }

  /* ---------- II. THE GOALS: what you told us, nothing worked out yet ---------- */
  function renderGoalList() {
    const wrap = $("#goal-list"), goals = C.m.goals;
    if (!goals.length) {
      wrap.innerHTML = `<div class="empty panel"><p class="empty__title">Nothing to aim for yet.</p><p class="section-note">Add a goal, or turn on retirement under No. VI.</p></div>`;
      return;
    }
    const order = goals.map((g, i) => i).sort((a, b) => goals[a].idx - goals[b].idx || goals[a].month - goals[b].month);
    wrap.innerHTML = order.map((i) => {
      const g = goals[i], isRet = g.kind === "retire";
      const due = isRet ? `${g.year} · ${yearsAway(g.idx)}` : `${MONTHS[g.month]} ${g.year} · ${yearsAway(g.idx)}`;
      const dots = Array.from({ length: 10 }, (_, k) => `<i class="${k < g.importance ? "on" : ""}"></i>`).join("");
      return `<article class="card card--input" style="--gc:${goalColor(g)}" data-id="${esc(g.id)}">
        <div class="card__top">
          <span class="card__due">${due}</span>
          <span class="card__weight" role="img" aria-label="Importance ${g.importance} of 10">${dots}</span>
        </div>
        <h3 class="card__name">${esc(g.name)}</h3>
        <dl class="card__facts">
          <div><dt>Costs</dt><dd>${money(g.cost)}</dd></div>
          ${isRet
            ? `<div><dt>Based on</dt><dd><span>25 years of ${flow(state.retirement.spending)}</span></dd></div>`
            : `<div><dt>Would accept</dt><dd>${g.partial > 0 ? compact(g.partial) : "<span>all or nothing</span>"}</dd></div>`}
          <div><dt>Importance</dt><dd>${g.importance} <span>/ 10</span></dd></div>
        </dl>
        <div class="card__actions">
          ${isRet
            ? `<a class="link-btn" href="#retirement">Edit retirement</a>`
            : `<button type="button" class="link-btn" data-act="edit">Edit</button><button type="button" class="link-btn link-btn--danger" data-act="remove">Remove</button>`}
        </div>
      </article>`;
    }).join("") + `<a class="card card--next" href="#beliefs"><span class="card__next-k">Next</span><span class="card__next-t">Set your beliefs →</span><span class="section-note">Your risk limit and priorities shape which goals the plan can fund.</span></a>`;
  }

  function renderTimeline() {
    const el = $("#timeline");
    if (!C.m.goals.length) { el.innerHTML = ""; return; }
    const goals = C.m.goals;
    const W = el.clientWidth || 600, H = 250, padX = 24, mid = 112;
    const span = Math.max(...goals.map((g) => g.idx)) + 1;
    const x = (yr) => padX + timeScale(yr - BASE, span) * (W - padX * 2);
    const maxCost = Math.max(...goals.map((g) => g.cost));
    const rad = (c) => 5 + 11 * Math.sqrt(c / maxCost);

    let ticks = "";
    yearTicks(span, (k) => x(BASE + k), 46).forEach((k) => {
      const yr = BASE + k;
      ticks += `<line class="tl-tick" x1="${x(yr)}" x2="${x(yr)}" y1="${mid - 4}" y2="${mid + 4}"/><text class="tl-year" x="${x(yr)}" y="${mid + 32}" text-anchor="middle">${yr}</text>`;
    });
    const order = goals.map((g, i) => i).sort((a, b) => goals[a].idx + goals[a].month / 12 - (goals[b].idx + goals[b].month / 12));
    const tiers = [-44, 62, -80, 98];
    let marks = "";
    order.forEach((i, n) => {
      const g = goals[i], cx = x(g.year + g.month / 12), ty = mid + tiers[n % 4];
      const label = g.name.length > 26 ? g.name.slice(0, 25) + "…" : g.name;
      const lx = clamp(cx, 70, W - 70);
      marks += `<g class="tl-goal" style="--gc:${goalColor(g)}">
        <line class="tl-stem" x1="${cx}" x2="${lx}" y1="${mid}" y2="${ty + (ty < mid ? 6 : -16)}"/>
        <circle class="tl-dot" cx="${cx}" cy="${mid}" r="${rad(g.cost)}"><title>${esc(g.name)}: ${money(g.cost)}</title></circle>
        <text class="tl-name" x="${lx}" y="${ty}" text-anchor="middle">${esc(label)}</text>
        <text class="tl-pct" x="${lx}" y="${ty + 15}" text-anchor="middle">${g.kind === "retire" ? g.year : MONTHS[g.month].slice(0, 3) + " " + g.year} · ${compact(g.cost)}</text>
      </g>`;
    });
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><line class="tl-axis" x1="${padX}" x2="${W - padX}" y1="${mid}" y2="${mid}"/>${ticks}${marks}</svg>`;
  }

  /* ---------- III. THE PLAN ---------- */
  function renderPlan() {
    const sum = $("#plan-summary"), gantt = $("#gantt"), strat = $("#strategy");
    fillGoalSelect($("#wf-goal"));
    renderCashList();
    if (!C.plan) {
      sum.innerHTML = `<p class="section-note">There is nothing to plan yet. <a href="#goals">Add a goal</a> first.</p>`;
      gantt.innerHTML = strat.innerHTML = "";
      return;
    }
    const goals = C.m.goals, plan = C.plan, res = plan.result;
    const count = (d) => plan.decisions.filter((x) => x === d).length;
    sum.innerHTML = `
      <div class="stat"><span class="stat__num">${count(1)}</span><span class="stat__label">funded in full</span></div>
      <div class="stat"><span class="stat__num">${count(2)}</span><span class="stat__label">funded in part</span></div>
      <div class="stat"><span class="stat__num">${count(0)}</span><span class="stat__label">set aside for now</span></div>
      <div class="stat stat--lead"><span class="stat__num">${pct(res.share)}</span><span class="stat__label">of what you care about, on average, counting each goal by its importance</span></div>`;

    /* layout across the timeline */
    const r = E.portfolio(plan.level, state.beliefs.esg).mu;
    const marks = earmarks(goals, plan.decisions, state.picture.networth, r, C.m.base.retireIdx);
    const T = C.m.horizon;
    const order = goals.map((g, i) => i).sort((a, b) => goals[a].idx - goals[b].idx);
    const totalMark = marks.reduce((a, b) => a + b, 0);
    const ticks = yearTicks(T, (k) => timeScale(k, T) * 100, 22);
    gantt.innerHTML = order.map((i) => {
      const g = goals[i], d = plan.decisions[i], w = timeScale(g.idx, T) * 100;
      const amt = d === 1 ? g.cost : d === 2 ? g.partial : 0;
      return `<div class="gantt__row${d === 0 ? " is-skipped" : ""}" style="--gc:${goalColor(g)}">
        <div class="gantt__label"><span class="gantt__name" title="${esc(g.name)}">${esc(g.name)}</span><small>${g.kind === "retire" ? g.year : MONTHS[g.month].slice(0, 3) + " " + g.year} · ${d === 0 ? "set aside" : compact(amt)}</small></div>
        <div class="gantt__track"><div class="gantt__bar" style="width:${w}%"></div><span class="gantt__end" style="left:${w}%"></span></div>
        <div class="gantt__mark">${d === 0 ? "—" : marks[i] >= 500 ? "≈ " + compact(per(marks[i])) + "<small>/" + period().short + "</small>" : "<small>covered</small>"}</div>
      </div>`;
    }).join("") + `<div class="gantt__row gantt__axisrow" aria-hidden="true"><span></span><div class="gantt__ticks">${ticks.map((k) => `<span style="left:${timeScale(k, T) * 100}%">${BASE + k}</span>`).join("")}</div><span></span></div>
      <p class="section-note gantt__note">Time is stretched so the next few years get more room. "Covered" means money you already have should pay for it. The last column is a suggested amount to set aside ${period().word} for that goal, growing at ${(r * 100).toFixed(1)}% a year after inflation. Together that's ${flow(totalMark, compact)}. You currently save ${flow(C.m.savings, compact)}.${totalMark > C.m.savings * 1.02 ? " That gap is why some goals are only partly funded or set aside." : ""}</p>`;

    /* strategy */
    const R = E.RISK[plan.level], tol = state.beliefs.tolerance, P = E.portfolio(plan.level, state.beliefs.esg);
    const mix = res.mixNow, rd = (v) => Math.round(v);
    let why;
    if (plan.idealLevel > plan.level) {
      const gain = plan.byLevel[plan.idealLevel].util / Math.max(1e-9, plan.byLevel[plan.level].util) - 1;
      why = `Your goals would do a little better if they could go up to <strong>${E.RISK[plan.idealLevel].name}</strong> (about ${Math.max(1, Math.round(gain * 100))}% more of what you care about), but you've asked for no more than ${E.RISK[tol].name}. <a href="#beliefs">Change that under Beliefs</a>.`;
    } else if (plan.level < tol) {
      why = `You would accept up to ${E.RISK[tol].name}, but more risk wouldn't help your goals enough to be worth it, so no goal goes past ${R.name}.`;
    } else {
      why = `Of the limits you allow, this one gets you the most of what you care about.`;
    }
    strat.innerHTML = `
      <p class="strat__level">Up to ${R.name}${state.beliefs.esg ? ' <span class="tag tag--esg">ESG</span>' : ""}</p>
      <p class="section-note">All your goals share one portfolio, and its mix is picked again every year. Today it holds:</p>
      <div class="mixbar" role="img" aria-label="${rd(mix.stocks)}% stocks, ${rd(mix.bonds)}% bonds, ${rd(mix.cash)}% cash">
        ${["stocks", "bonds", "cash"].map((k) => mix[k] >= 0.5 ? `<span class="mixbar__${k}" style="width:${mix[k]}%"></span>` : "").join("")}
      </div>
      <ul class="legend">
        <li><i class="sw sw--stocks"></i>Stocks ${rd(mix.stocks)}%</li>
        <li><i class="sw sw--bonds"></i>Bonds ${rd(mix.bonds)}%</li>
        <li><i class="sw sw--cash"></i>Cash ${rd(mix.cash)}%</li>
      </ul>
      <p class="strat__numbers">Expected return today <strong>${(res.muNow * 100).toFixed(1)}%</strong> a year after inflation. It never goes past about <strong>±${Math.round(P.sigma * 100)}%</strong> swings in a typical year.</p>
      <p class="section-note">${why}</p>`;
    renderGlide();
  }

  /* the shared portfolio: its average share in stocks, year by year, with each goal's date marked */
  function renderGlide() {
    const el = $("#glide"), plan = C.plan, res = plan.result, goals = C.m.goals, T = C.m.horizon, gl = res.glide;
    const ticks = yearTicks(T, (k) => timeScale(k, T) * 100, 22);
    const axis = `<div class="gantt__row gantt__axisrow" aria-hidden="true"><span></span><div class="gantt__ticks">${ticks.map((k) => `<span style="left:${timeScale(k, T) * 100}%">${BASE + k}</span>`).join("")}</div><span></span></div>`;
    if (!gl.length) {
      el.innerHTML = `<p class="section-note">Every goal is due this year, so nothing needs investing yet.</p>`;
      return;
    }
    const cells = gl.map((s, t) => {
      const l = timeScale(t, T) * 100, w = timeScale(t + 1, T) * 100 - l;
      return `<span class="glide__cell" style="left:${l}%;width:${w}%;--s:${Math.round(s)}%" title="${BASE + t}: about ${Math.round(s)}% in stocks"></span>`;
    }).join("");
    const due = goals.map((g, i) => (plan.decisions[i] === 0 ? null : `<span class="glide__due" style="left:${Math.min(99.4, timeScale(g.idx, T) * 100)}%;--gc:${goalColor(g)}" title="${esc(g.name)}, ${g.year}"></span>`)).join("");
    el.innerHTML = `<div class="gantt__row glide__row">
        <div class="gantt__label"><span class="gantt__name">Your portfolio</span><small>today ${E.RISK[res.level0].name}</small></div>
        <div class="glide__track" role="img" aria-label="About ${Math.round(gl[0])}% in stocks now, ${Math.round(gl[gl.length - 1])}% in the last year before your final goal">${cells}${due}</div>
        <div class="gantt__mark">${Math.round(gl[0])}% <small>→</small> ${Math.round(gl[gl.length - 1])}%</div>
      </div>` + axis + `
      <div class="glide__key" aria-hidden="true"><span>more bonds</span><i></i><span>more stocks</span></div>
      <p class="section-note gantt__note">Shading is the average across all simulated futures; the marks are when goals come due. In any one future, the plan steps down to less risk when you're ahead and may step up when you're behind, never past your limit. The last column is the share in stocks this year and in the last year before your final goal.</p>`;
  }

  function fillGoalSelect(sel) {
    const user = state.goals;
    const prev = sel.value;
    sel.innerHTML = user.length ? user.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("") : "<option value=''>No goals to upgrade</option>";
    sel.disabled = !user.length;
    if (user.some((g) => g.id === prev)) sel.value = prev;
  }

  function renderCashList() {
    const list = $("#cash-list");
    const items = state.cashflows.slice().sort((a, b) => a.year - b.year);
    list.innerHTML = items.length
      ? `<li class="cash-list__head">Saved changes</li>` + items.map((c) => `<li><span>${c.year}</span><span class="${c.amount < 0 ? "neg" : "pos"}">${c.amount < 0 ? "−" : "+"}${money(Math.abs(c.amount))}</span><button type="button" class="link-btn link-btn--danger" data-cash="${esc(c.id)}" aria-label="Remove ${c.year} change">Remove</button></li>`).join("")
      : "";
  }

  /* ---------- review before confirming ---------- */
  let pending = null;
  function propose(label, mutate) {
    const next = clone(state);
    mutate(next);
    const after = planFor(next);
    pending = { label, mutate, after };
    renderReview();
  }

  function renderReview() {
    const box = $("#review");
    if (!pending) { box.hidden = true; return; }
    const before = C, after = pending.after;
    $("#review-title").textContent = pending.label;
    let rows = "";
    if (before.plan && after.plan) {
      const ids = new Set([...before.m.goals.map((g) => g.id), ...after.m.goals.map((g) => g.id)]);
      ids.forEach((id) => {
        const bi = before.m.goals.findIndex((g) => g.id === id), ai = after.m.goals.findIndex((g) => g.id === id);
        const g = ai >= 0 ? after.m.goals[ai] : before.m.goals[bi];
        const db = bi >= 0 ? before.plan.decisions[bi] : null, da = ai >= 0 ? after.plan.decisions[ai] : null;
        const pb = bi >= 0 ? oddsOf(before.plan.result, db, bi) : null, pa = ai >= 0 ? oddsOf(after.plan.result, da, ai) : null;
        const diff = pb !== null && pa !== null ? Math.round((pa - pb) * 100) : null;
        rows += `<tr><th scope="row"><span class="dot" style="--gc:${goalColor(g)}"></span>${esc(g.name)}${g.cost !== (bi >= 0 ? before.m.goals[bi].cost : g.cost) ? ` <small>now ${compact(g.cost)}</small>` : ""}</th>
          <td>${pb === null ? "—" : pct(pb)}<small>${db === null ? "" : DECISION[db]}</small></td>
          <td>${pa === null ? "—" : pct(pa)}<small>${da === null ? "" : DECISION[da]}</small></td>
          <td class="${diff > 0 ? "pos" : diff < 0 ? "neg" : ""}">${diff === null ? "" : (diff > 0 ? "+" : diff < 0 ? "−" : "±") + Math.abs(diff)}</td></tr>`;
      });
    }
    const lv = (c) => (c.plan ? E.RISK[c.plan.level].name : "—");
    const sh = (c) => (c.plan ? pct(c.plan.result.share) : "—");

    /* say in words how the plan itself changes, so a lower number never comes as a surprise */
    const notes = [];
    if (before.plan && after.plan) {
      const verb = { 1: "funds it in full", 2: "aims for the smaller version", 0: "sets it aside" };
      after.m.goals.forEach((g, ai) => {
        const bi = before.m.goals.findIndex((x) => x.id === g.id);
        if (bi >= 0 && before.plan.decisions[bi] !== after.plan.decisions[ai]) notes.push(`For ${g.name}, the plan now ${verb[after.plan.decisions[ai]]}.`);
      });
      if (before.plan.level !== after.plan.level) notes.push(`The plan moves from ${lv(before)} to ${lv(after)}.`);
      const drops = after.m.goals.filter((g, ai) => { const bi = before.m.goals.findIndex((x) => x.id === g.id); return bi >= 0 && oddsOf(after.plan.result, after.plan.decisions[ai], ai) < oddsOf(before.plan.result, before.plan.decisions[bi], bi) - 0.02; });
      if (drops.length && after.plan.result.share > before.plan.result.share) notes.push(`Some odds go down because the money is moved to where it does more for you overall. Your weighted share still rises.`);
    }
    $("#review-body").innerHTML = `
      ${notes.length ? `<ul class="review__notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      <div class="review__strip">
        <div><span class="stat__label">Risk level</span><span class="review__chg">${lv(before)} <i>→</i> ${lv(after)}</span></div>
        <div><span class="stat__label">Share of what you care about</span><span class="review__chg">${sh(before)} <i>→</i> ${sh(after)}</span></div>
      </div>
      <div class="table-wrap"><table class="review__table"><thead><tr><th scope="col">Goal</th><th scope="col">Now</th><th scope="col">After</th><th scope="col">Change</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    box.hidden = false;
    box.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    box.focus({ preventScroll: true });
  }

  /* ---------- IV. BELIEFS ---------- */
  function rankItems() {
    const items = state.goals.map((g) => ({ id: g.id, name: g.name, importance: g.importance, color: g.color, year: g.year }));
    if (state.retirement.enabled) items.push({ id: "retire", name: state.retirement.label || "Retire at " + state.retirement.age, importance: state.retirement.importance, color: "r", year: 9999 });
    return items.sort((a, b) => b.importance - a.importance || a.year - b.year);
  }

  /* how each risk level would serve these goals, so the choice above is an informed one */
  function renderSuggestion() {
    const box = $("#suggest");
    if (!C || !C.plan) {
      box.innerHTML = `<p class="section-note">Once you've <a href="#goals">added a goal</a>, we'll show which risk level reaches the most of it.</p>`;
      return;
    }
    const tol = state.beliefs.tolerance, plan = C.plan, ideal = plan.idealLevel;
    const maxU = C.m.base.goals.reduce((a, g) => a + g.importance, 0) || 1;
    const share = plan.byLevel.map((b) => b.util / maxU);
    const top = Math.max(...share, 0.01);
    const sw = (L) => "±" + Math.round(E.portfolio(L, state.beliefs.esg).sigma * 100) + "%";

    let lead, action = "";
    if (ideal > tol) {
      lead = `For these goals, <strong>${E.RISK[ideal].name}</strong> reaches the most: about ${pct(share[ideal])} of what you care about, against ${pct(share[tol])} at your current limit. The trade-off is bigger swings, around ${sw(ideal)} in a typical year instead of ${sw(tol)}.`;
      action = `<button type="button" class="btn btn--primary btn--small" id="use-suggest" data-level="${ideal}">Use ${E.RISK[ideal].name}</button>`;
    } else if (ideal < tol) {
      const at = plan.level;
      lead = `You allow up to ${E.RISK[tol].name}, but <strong>${E.RISK[ideal].name}</strong> reaches nearly as much of your goals (${pct(share[ideal])} against ${pct(share[at])}) with smaller swings, around ${sw(ideal)} in a typical year instead of ${sw(at)}.`
        + (at > ideal ? "" : ` The plan already uses ${E.RISK[ideal].name}.`);
      if (at > ideal) action = `<button type="button" class="btn btn--primary btn--small" id="use-suggest" data-level="${ideal}">Use ${E.RISK[ideal].name}</button>`;
    } else {
      lead = `Your limit, <strong>${E.RISK[tol].name}</strong>, is also the level that reaches the most of your goals. Nothing to change.`;
    }
    box.innerHTML = `<p class="suggest__lead">${lead}</p>
      <ul class="suggest" aria-label="Share of what you care about, by risk level">
        ${E.RISK.map((r, L) => `<li class="${L === ideal ? "is-ideal" : ""}${L === tol ? " is-chosen" : ""}">
          <span class="suggest__name">${r.name}${L === ideal ? ' <em>suggested</em>' : ""}${L === tol ? ' <em class="is-you">your limit</em>' : ""}</span>
          <span class="suggest__bar" aria-hidden="true"><span style="width:${(share[L] / top) * 100}%"></span></span>
          <span class="suggest__pct">${pct(share[L])}</span></li>`).join("")}
      </ul>
      <p class="section-note">Bars show how much of what you care about each level reaches, counting each goal by its importance.</p>
      ${action}
      <p class="suggest__fine">A result from the model, not personal financial advice. Only pick swings you could sit through without selling.</p>`;
  }

  /* age rule of thumb: (110 − age)% in stocks, with 100 and 120 as the cautious and bold ends */
  function renderAgeRule() {
    const box = $("#age-rule"), age = Math.round(state.picture.age);
    if (!(age >= 16 && age <= 100)) {
      box.innerHTML = `<p class="section-note">Enter your age to see what the common age rule suggests.</p>`;
      return;
    }
    const st = (n) => clamp(n - age, 0, 100);
    const stocks = st(110);
    const L = E.RISK.reduce((b, r, i) => Math.abs(r.mix.stocks - stocks) < Math.abs(E.RISK[b].mix.stocks - stocks) ? i : b, 0);
    const tol = state.beliefs.tolerance;
    const note = L === tol ? `That matches your current limit.`
      : `That's ${L > tol ? "more" : "less"} risk than your current limit, ${E.RISK[tol].name}.`;
    box.innerHTML = `<p class="age-rule__lead">At ${age}, the rule of thumb puts about <strong>${stocks}% in stocks</strong> and the rest in bonds, which is closest to <strong>${E.RISK[L].name}</strong>. ${note}</p>
      <p class="section-note">The rule is 110 minus your age. Stricter advisors use 100 (${st(100)}% stocks) and bolder ones use 120 (${st(120)}%). Younger people have more years to recover from a crash.</p>
      ${L === tol ? "" : `<button type="button" class="btn btn--small" id="use-age" data-level="${L}">Use ${E.RISK[L].name}</button>`}`;
  }

  function renderBeliefs(focusId, focusDir) {
    const tol = state.beliefs.tolerance, P = E.portfolio(tol, state.beliefs.esg);
    $("#tolerance").value = tol;
    $("#tol-out").textContent = E.RISK[tol].name;
    $("#tol-desc").textContent = `${TOL_DESC[tol]} Expected return of about ${(P.mu * 100).toFixed(1)}% a year after inflation, with typical swings of ±${Math.round(P.sigma * 100)}%.`;
    $("#esg").checked = state.beliefs.esg;
    $("#esg-note").textContent = state.beliefs.esg
      ? "On. With fewer funds to choose from, we assume about 0.3% less return a year and slightly bigger swings."
      : "Off. The plan can use any broad, low-cost index fund.";

    renderSuggestion();
    renderAgeRule();

    const items = rankItems();
    $("#rank-list").innerHTML = items.map((it, n) => `<li style="--gc:${goalColor(it)}">
      <span class="rank__n">${n + 1}</span><span class="dot"></span>
      <span class="rank__name"><input class="rank__input" type="text" maxlength="60" value="${esc(it.name)}" data-rename="${esc(it.id)}" aria-label="Rename ${esc(it.name)}" title="Click to rename" spellcheck="false" /><small>importance ${it.importance}</small></span>
      <span class="rank__btns">
        <button type="button" class="btn btn--icon" data-rank="${esc(it.id)}" data-dir="-1" aria-label="Move ${esc(it.name)} up"${n === 0 ? " disabled" : ""}>↑</button>
        <button type="button" class="btn btn--icon" data-rank="${esc(it.id)}" data-dir="1" aria-label="Move ${esc(it.name)} down"${n === items.length - 1 ? " disabled" : ""}>↓</button>
      </span></li>`).join("");
    if (focusId) {
      const b = $(`#rank-list [data-rank="${CSS.escape(focusId)}"][data-dir="${focusDir}"]`) || $(`#rank-list [data-rank="${CSS.escape(focusId)}"]:not([disabled])`);
      if (b) b.focus();
    }

    /* alignment */
    const out = [];
    if (C.plan) {
      const goals = C.m.goals, plan = C.plan, res = plan.result;
      out.push(plan.idealLevel > tol
        ? ["warn", `Your portfolio stays at or below ${E.RISK[plan.level].name}, inside your ${E.RISK[tol].name} limit. Your goals would do somewhat better with more risk, but the plan respects your limit.`]
        : ["good", `Your portfolio stays at or below ${E.RISK[plan.level].name}, inside your ${E.RISK[tol].name} limit, even as it changes year to year.`]);

      const lvl = (d) => (d === 1 ? 2 : d === 2 ? 1 : 0);
      let clash = null;
      goals.forEach((hi, a) => goals.forEach((lo, b) => {
        if (!clash && hi.importance > lo.importance && lvl(plan.decisions[a]) < lvl(plan.decisions[b])) clash = [hi, lo, plan.decisions[a]];
      }));
      out.push(clash
        ? ["warn", `${clash[1].name} is funded more fully than ${clash[0].name}, even though you rank ${clash[0].name} higher. The plan does this because ${clash[1].name} ${clash[1].cost < clash[0].cost ? "costs much less" : "comes due at a better time"}, so it adds more overall. If that's not what you want, give ${clash[0].name} more weight.`]
        : ["good", "No goal you rank higher is funded less than a goal you rank lower."]);

      const top = goals.reduce((b, g, j) => (g.importance > goals[b].importance ? j : b), 0);
      const dt = plan.decisions[top], pt = dt === 0 ? 0 : oddsOf(res, dt, top);
      const how = dt === 2 ? "of reaching at least the smaller version" : "of being fully funded";
      out.push([pt >= 0.6 ? "good" : "warn", `Your top priority, ${goals[top].name}, has a ${pct(pt)} chance ${how}.${pt < 0.6 ? " To improve it, save more, push the date back, or lower the weight of other goals." : ""}`]);
    }
    out.push(state.beliefs.esg
      ? ["good", "Only ESG-screened funds are used, as you asked."]
      : ["neutral", "There is no values screen on your investments. Turn on ESG above if that matters to you."]);
    const icon = { good: "✓", warn: "!", neutral: "○" };
    $("#alignment").innerHTML = out.map(([k, t]) => `<li class="align--${k}"><span class="align__icon" aria-hidden="true">${icon[k]}</span><span>${esc(t)}</span></li>`).join("");
  }

  /* ---------- V. THE ODDS ---------- */
  let fanLevel = null;
  function renderOdds() {
    const table = $("#odds-matrix"), out = $("#outcomes"), btns = $("#fan-levels");
    if (!C.plan) { table.innerHTML = ""; out.innerHTML = ""; btns.innerHTML = ""; $("#fan").innerHTML = ""; return; }
    const goals = C.m.goals, tol = state.beliefs.tolerance, planL = C.plan.level;
    if (fanLevel === null) fanLevel = planL;
    const cls = (L) => (L === planL ? "is-plan" : "") + (L > tol ? " is-over" : "");
    let html = `<thead><tr><th scope="col">Goal</th>${E.RISK.map((r, L) => `<th scope="col" class="${cls(L)}">${r.name}</th>`).join("")}</tr></thead><tbody>`;
    goals.forEach((g, i) => {
      const d = C.plan.decisions[i], skipped = d === 0;
      html += `<tr${skipped ? ' class="is-skipped"' : ""}><th scope="row"><span class="dot" style="--gc:${goalColor(g)}"></span>${esc(g.name)}${skipped ? " <small>set aside</small>" : d === 2 ? ` <small>at ${compact(g.partial)}</small>` : ""}</th>`;
      C.byLevel.forEach((res, L) => {
        const p = oddsOf(res, d, i);
        html += `<td class="${cls(L)}" style="--p:${skipped ? 0 : p}">${skipped ? "—" : pct(p)}</td>`;
      });
      html += "</tr>";
    });
    html += `</tbody><tfoot><tr><th scope="row">Share of what you care about</th>${C.byLevel.map((res, L) => `<td class="${cls(L)}">${pct(res.share)}</td>`).join("")}</tr></tfoot>`;
    table.innerHTML = html;

    btns.innerHTML = E.RISK.map((r, L) => `<button type="button" data-fan="${L}" aria-pressed="${L === fanLevel}">${r.name}</button>`).join("");
    const res = C.byLevel[fanLevel], T = C.m.horizon;
    out.innerHTML = `
      <div class="stat"><span class="stat__num">${pct(res.share)}</span><span class="stat__label">of what you care about</span></div>
      <div class="stat"><span class="stat__num">${compact(res.fan.p10[T])}</span><span class="stat__label">bad case in ${BASE + T} (1 in 10 do worse)</span></div>
      <div class="stat"><span class="stat__num">${compact(res.fan.p50[T])}</span><span class="stat__label">middle case in ${BASE + T}</span></div>
      <div class="stat"><span class="stat__num">${compact(res.fan.p90[T])}</span><span class="stat__label">good case in ${BASE + T} (1 in 10 do better)</span></div>`;
  }

  function renderFan() {
    const el = $("#fan");
    if (!C.plan) return;
    const res = C.byLevel[fanLevel], f = res.fan, T = f.p50.length - 1, goals = C.m.goals;
    const W = el.clientWidth || 600, H = Math.round(clamp(W * 0.42, 220, 320));
    const pad = { l: 54, r: 14, t: 14, b: 28 };
    const maxY = Math.max(...f.p90, ...goals.map((g) => g.cost)) * 1.06 || 1;
    const x = (k) => pad.l + (k / T) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - Math.min(v, maxY) / maxY) * (H - pad.t - pad.b);
    let band = "M" + f.p90.map((v, k) => `${x(k)},${y(v)}`).join("L") + "L" + f.p10.map((v, k) => `${x(k)},${y(v)}`).reverse().join("L") + "Z";
    const med = "M" + f.p50.map((v, k) => `${x(k)},${y(v)}`).join("L");
    let grid = "";
    for (let n = 0; n <= 4; n++) {
      const v = (maxY / 4) * n;
      grid += `<line class="ch-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-label" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`;
    }
    const step = Math.max(1, Math.ceil(T / Math.max(2, Math.floor(W / 90))));
    for (let k = 0; k <= T; k += step) grid += `<text class="ch-label" x="${x(k)}" y="${H - 8}" text-anchor="middle">${BASE + k}</text>`;
    const marks = goals.map((g) => `<g style="--gc:${goalColor(g)}"><line class="ch-goal" x1="${x(g.idx)}" x2="${x(g.idx)}" y1="${pad.t}" y2="${H - pad.b}"/><circle class="ch-goal-dot" cx="${x(g.idx)}" cy="${y(g.cost)}" r="5"><title>${esc(g.name)}: ${money(g.cost)} in ${g.year}</title></circle></g>`).join("");
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${grid}<path class="ch-band" d="${band}"/><path class="ch-median" d="${med}"/>${marks}</svg>
      <ul class="legend legend--chart"><li><i class="sw sw--band"></i>8 in 10 futures fall in this range</li><li><i class="sw sw--line"></i>middle case</li><li><i class="sw sw--dot"></i>goal cost, when due</li></ul>`;
  }

  /* ---------- VI. RETIREMENT ---------- */
  function renderRetirement() {
    const r = state.retirement, R = C.ret;
    $$('input[name="ret-mode"]').forEach((el) => (el.checked = el.value === r.mode));
    const contrib = r.cTrad + r.cRoth + r.cTaxable, sv = state.picture.invest * 12;
    $("#acct-note").textContent = Math.abs(contrib - sv) > 1
      ? `These add up to ${flow(contrib)}. Your picture invests ${flow(sv)}.`
      : `These match the ${flow(sv)} you invest.`;
    $("#ann-hint").textContent = `Pays about ${(R.annuityRate * 100).toFixed(1)}% a year for life${r.annuityOn ? `, about ${flow(R.annuityIncome)}. Paid for from the traditional account first.` : "."}`;
    $("#ann-amt").closest(".field").classList.toggle("is-dim", !r.annuityOn);

    const eff = R.efficient, conv = R.conventional, st = R.strategy, ra = retireAges(state), span = `age ${ra.retireAge} to ${ra.lifeExp}`;
    const total = R.atRetirement.trad + R.atRetirement.roth + R.atRetirement.taxable;
    const usual = "the usual order (taxable, then traditional, then Roth)";
    let head;
    if (r.mode === "income") {
      const gain = R.spend - R.spendConv;
      head = `<span class="eyebrow">Spend as much as you safely can</span>
        <p class="ret-big">${money(per(R.spend))}<span> ${period().word}</span></p>
        <p class="ret-sub">after tax, from ${span}${R.annuityIncome ? `, including ${money(per(R.annuityIncome))} from the annuity` : ""}.</p>
        <p class="ret-compare">${st.kind === "conventional" || gain < 50
          ? `Here ${usual} works as well as anything we tried.`
          : `Taking money out in ${usual} gives ${flow(R.spendConv)}. The order below adds <strong>${flow(gain)}</strong> and cuts lifetime taxes from ${compact(conv.totalTax)} to ${compact(eff.totalTax)}.`}</p>`;
    } else {
      const gain = eff.legacy - conv.legacy;
      head = `<span class="eyebrow">Leave as much as you can</span>
        <p class="ret-big">${money(eff.legacy)}</p>
        <p class="ret-sub">left to your heir after their taxes, while you spend ${flow(R.spend)} from ${span}.</p>
        <p class="ret-compare">${eff.ranOutAge ? `<strong class="neg">At this spending, the money runs out at age ${eff.ranOutAge}.</strong> Spend less or retire later. ` : ""}${st.kind === "conventional" || gain < 500
          ? `Here ${usual} leaves as much as anything we tried.`
          : `Taking money out in ${usual} would leave ${money(conv.legacy)}. The order below leaves <strong>${money(gain)}</strong> more, because Roth money passes to an heir tax-free while traditional money is taxed again.`}</p>`;
    }
    const ri = goalById("retire");
    const odds = ri >= 0 && C.plan.decisions[ri] !== 0 ? ` The ${pct(C.plan.result.pFull[ri])} chance on your retirement goal is the stricter test: it also pays for your other goals and includes bad market years.` : "";
    head += `<p class="ret-foot">This page follows your retirement accounts alone: about ${compact(total)} at ${ra.retireAge} in today's dollars, growing at the average ${(E.portfolio(C.plan ? C.plan.level : state.beliefs.tolerance, state.beliefs.esg).mu * 100).toFixed(1)}% a year after inflation.${odds}</p>`;
    $("#ret-headline").innerHTML = head;

    const steps = [];
    if (R.annuityIncome) steps.push(["Annuity income first", `${flow(R.annuityIncome)}, guaranteed for life.`]);
    const roth = ["Roth 401(k)/IRA", r.mode === "legacy" ? "Tax-free for you and for your heir, so it goes last." : "Tax-free. Using it last gives it the most years to grow."];
    if (st.kind === "conventional") {
      steps.push(["Taxable brokerage", "Only the gains are taxed, and much of that falls in the 0% capital gains bracket."]);
      steps.push(["Traditional 401(k)/IRA", "Taxed as income when you take it out."]);
      steps.push(roth);
    } else {
      steps.push([`Traditional 401(k)/IRA, up to ${compact(R.fillTop)} of income`, `Use up the ${st.bracket} tax bracket every year, so the balance doesn't grow into a larger tax bill later.`]);
      steps.push(["Taxable brokerage", "Only the gains are taxed, often at 0% when your other income is low."]);
      steps.push(roth);
      steps.push(["Traditional, beyond that bracket", "Only if the rest runs short."]);
    }
    let notes = `<li class="order__note"><strong>From age ${R.rmdAge}</strong><span>The IRS requires a minimum withdrawal from traditional accounts each year (an RMD). The plan takes that first and reinvests anything you don't spend.</span></li>`;
    if (st.kind === "fill" && st.convert) notes = `<li class="order__note"><strong>When spending is covered early</strong><span>Move the rest of the ${st.bracket} bracket from traditional into Roth (a Roth conversion), paying the lower tax now.</span></li>` + notes;
    $("#ret-order").innerHTML = steps.map(([t, d]) => `<li><strong>${esc(t)}</strong><span>${esc(d)}</span></li>`).join("") + notes;

    /* the withdrawal schedule: what comes out of each account, what tax takes, what's left to live on */
    const rows = eff.rows, first = rows[0], yearly = period().n === 1;
    $("#ret-table-explain").innerHTML = first
      ? `Each row is one year of retirement. The three <strong>Take out</strong> columns are withdrawals: money you move out of each account to live on${yearly ? "" : `, shown ${period().word}`}. Tax is paid from that, and what remains is what <strong>you get to spend</strong>. For example, at ${first.age} you take out ${flow(first.trad + first.taxable + first.roth)}${first.annuity ? ` and receive ${flow(first.annuity)} from the annuity` : ""}, pay ${flow(first.tax)} in tax, and spend ${flow(first.spent)}. <strong>Still invested</strong> is the whole balance left growing at the end of that year.`
      : "";
    const any = (k) => rows.some((w) => w[k] > 0.5);
    const showAnn = any("annuity"), showConv = any("converted");
    const dash = (v) => (per(v) > 0.5 ? compact(per(v)) : "—");
    $("#ret-table").innerHTML = `<thead>
        <tr class="yearly__group"><th scope="col" rowspan="2">Age</th><th scope="colgroup" colspan="3" class="is-out">Take out of${yearly ? "" : ` <small>${period().word}</small>`}</th>${showAnn ? '<th scope="col" rowspan="2">Annuity pays you</th>' : ""}<th scope="col" rowspan="2">Tax</th><th scope="col" rowspan="2" class="is-spend">You get to spend</th>${showConv ? '<th scope="col" rowspan="2">Moved to Roth</th>' : ""}<th scope="col" rowspan="2">Still invested</th></tr>
        <tr><th scope="col" class="is-out">Traditional</th><th scope="col" class="is-out">Taxable</th><th scope="col" class="is-out">Roth</th></tr>
      </thead><tbody>`
      + rows.map((w) => `<tr><th scope="row">${w.age}</th><td class="is-out">${dash(w.trad)}</td><td class="is-out">${dash(w.taxable)}</td><td class="is-out">${dash(w.roth)}</td>${showAnn ? `<td>${dash(w.annuity)}</td>` : ""}<td>${dash(w.tax)}</td><td class="is-spend">${compact(per(w.spent))}</td>${showConv ? `<td>${dash(w.converted)}</td>` : ""}<td>${compact(w.endTrad + w.endRoth + w.endTaxable)}</td></tr>`).join("")
      + "</tbody>";
  }

  /* ---------- the schedule, to keep: a spreadsheet or a printout ---------- */
  const csvCell = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const toCSV = (lines) => lines.map((l) => l.map(csvCell).join(",")).join("\r\n");

  function retirementCSV() {
    const r = state.retirement, p = state.picture, R = C.ret, rows = R.efficient.rows;
    const L = C.plan ? C.plan.level : state.beliefs.tolerance;
    const n = (v) => Math.round(v), f = (v) => Math.round(per(v)), col = period().col;
    const lines = [
      ["Retirement withdrawal schedule", "Cognifi"],
      ["Made on", new Date().toISOString().slice(0, 10)],
      ["All amounts in today's dollars"],
      ["Money in and out shown", col],
      [],
      ["Assumptions"],
      ["Your age", p.age],
      ["Retire at age", retireAges(state).retireAge],
      ["Plan to age", retireAges(state).lifeExp],
      ["Aim", r.mode === "income" ? "Spend as much as I safely can" : "Leave as much as I can to an heir"],
      ["Spending after tax, " + col, f(R.spend)],
      ["Return before retirement, after inflation", (E.portfolio(L, state.beliefs.esg).mu * 100).toFixed(1) + "%"],
      ["Return in retirement, after inflation", (E.portfolio(Math.min(L, 2), state.beliefs.esg).mu * 100).toFixed(1) + "%"],
      ["Traditional 401(k)/IRA today", n(r.trad), "added " + col, f(r.cTrad)],
      ["Roth 401(k)/IRA today", n(r.roth), "added " + col, f(r.cRoth)],
      ["Taxable brokerage today", n(r.taxable), "added " + col, f(r.cTaxable)],
      ["Annuity", r.annuityOn ? n(R.annuityCost) + " put in, paying " + f(R.annuityIncome) + " " + col : "none"],
      ["Taxes", "2026 federal brackets, single filer, simplified"],
      [],
      ["Age", ...["Take out of Traditional", "of which required (RMD)", "Take out of Taxable", "Take out of Roth", "Annuity pays you", "Tax", "You get to spend", "Moved to Roth"].map((h) => h + ", " + col), "Still invested at year end: Traditional", "Still invested at year end: Taxable", "Still invested at year end: Roth", "Still invested at year end: Total"],
      ...rows.map((w) => [w.age, f(w.trad), f(w.rmd), f(w.taxable), f(w.roth), f(w.annuity), f(w.tax), f(w.spent), f(w.converted), n(w.endTrad), n(w.endTaxable), n(w.endRoth), n(w.endTrad + w.endTaxable + w.endRoth)]),
    ];
    return toCSV(lines);
  }

  /* everything you told us and everything we found, in one file */
  function planCSV() {
    const p = state.picture, b = state.beliefs, r = state.retirement, R = C.ret;
    const n = (v) => Math.round(v), f = (v) => Math.round(per(v)), col = period().col;
    const lines = [
      ["Your plan", "Cognifi"],
      ["Made on", new Date().toISOString().slice(0, 10)],
      ["All amounts in today's dollars"],
      ["Money in and out shown", col],
      [],
      ["Your financial picture"],
      ["Net worth", n(p.networth)],
      ["Income after tax, " + col, f(p.income)],
      ["Expenses, " + col, f(p.expenses)],
      ["Willing to invest, " + col, f(p.invest * 12)],
      ["Extra (what-if slider), " + col, f(state.extraMonthly * 12)],
      ["Your age", p.age],
      [],
      ["Beliefs"],
      ["Risk limit", E.RISK[b.tolerance].name],
      ["ESG-screened funds only", b.esg ? "Yes" : "No"],
      [],
    ];

    if (C.plan) {
      const goals = C.m.goals, plan = C.plan, res = plan.result;
      const order = goals.map((g, i) => i).sort((a, c) => goals[a].idx - goals[c].idx || goals[a].month - goals[c].month);
      lines.push(
        ["The plan"],
        ["Risk level used", E.RISK[plan.level].name],
        ["Share of what you care about", pct(res.share)],
        ["Expected return today, after inflation", (res.muNow * 100).toFixed(1) + "%"],
        ["Mix today", `${Math.round(res.mixNow.stocks)}% stocks, ${Math.round(res.mixNow.bonds)}% bonds, ${Math.round(res.mixNow.cash)}% cash`],
        [],
        ["Goals"],
        ["Goal", "Due", "Cost", "Would accept", "Importance (1-10)", "Plan", "Chance"],
        ...order.map((i) => {
          const g = goals[i], d = plan.decisions[i];
          const due = g.kind === "retire" ? g.year : `${MONTHS[g.month]} ${g.year}`;
          const chance = d === 0 ? `${pct(C.alone[i])} if pursued alone` : pct(oddsOf(res, d, i));
          return [g.name, due, n(g.cost), g.partial > 0 ? n(g.partial) : "all or nothing", g.importance, DECISION[d], chance];
        }),
        [],
        ["Chance of each goal, by risk level"],
        ["Goal", ...E.RISK.map((x) => x.name)],
        ...goals.map((g, i) => {
          const d = plan.decisions[i];
          return [g.name, ...C.byLevel.map((lv) => (d === 0 ? "set aside" : pct(oddsOf(lv, d, i))))];
        }),
        ["Share of what you care about", ...C.byLevel.map((lv) => pct(lv.share))],
        [],
      );
    } else {
      lines.push(["The plan", "No goals yet"], []);
    }

    if (state.cashflows.length) {
      lines.push(["Money in and out"], ["Year", "Amount"]);
      state.cashflows.slice().sort((a, c) => a.year - c.year).forEach((c) => lines.push([c.year, n(c.amount)]));
      lines.push([]);
    }

    lines.push(
      ["Retirement"],
      ["Counted as a goal", r.enabled ? "Yes" : "No"],
      ["Retire at age", retireAges(state).retireAge],
      ["Plan to age", retireAges(state).lifeExp],
      ["Aim", r.mode === "income" ? "Spend as much as I safely can" : "Leave as much as I can to an heir"],
      ["Spending you entered, after tax, " + col, f(r.spending)],
      [(r.mode === "income" ? "Most you can safely spend, after tax, " : "Spending the schedule uses, after tax, ") + col, f(R.spend)],
      ...(r.mode === "legacy" ? [["Left to your heir, after their taxes", n(R.efficient.legacy)]] : []),
      ["Traditional 401(k)/IRA today", n(r.trad), "added " + col, f(r.cTrad)],
      ["Roth 401(k)/IRA today", n(r.roth), "added " + col, f(r.cRoth)],
      ["Taxable brokerage today", n(r.taxable), "added " + col, f(r.cTaxable)],
      ["Annuity", r.annuityOn ? n(R.annuityCost) + " put in, paying " + f(R.annuityIncome) + " " + col : "none"],
      [],
      ["The yearly withdrawal schedule is in the separate retirement CSV on page VI."],
    );
    return toCSV(lines);
  }

  function saveFile(name, text) {
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const downloadCSV = () => saveFile(`retirement-withdrawals-age-${retireAges(state).retireAge}-to-${retireAges(state).lifeExp}.csv`, retirementCSV());
  const downloadPlanCSV = () => saveFile(`cognifi-plan-${new Date().toISOString().slice(0, 10)}.csv`, planCSV());

  /* print on paper colours, whatever the screen theme */
  function printPage() {
    const was = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "light");
    const restore = () => { document.documentElement.setAttribute("data-theme", was); window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  function renderRetChart() {
    const el = $("#ret-chart"), rows = C.ret.efficient.rows;
    if (!rows.length) { el.innerHTML = ""; return; }
    const W = el.clientWidth || 500, H = Math.round(clamp(W * 0.48, 200, 280));
    const pad = { l: 50, r: 10, t: 10, b: 26 };
    const keys = [["endTrad", "trad"], ["endTaxable", "taxable"], ["endRoth", "roth"]];
    const tot = rows.map((w) => w.endTrad + w.endTaxable + w.endRoth);
    const maxY = Math.max(...tot, 1) * 1.05, n = rows.length - 1 || 1;
    const x = (i) => pad.l + (i / n) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
    const acc = new Array(rows.length).fill(0);
    let areas = "";
    keys.forEach(([k, c]) => {
      const lower = acc.slice();
      rows.forEach((w, i) => (acc[i] += Math.max(0, w[k])));
      const d = "M" + acc.map((v, i) => `${x(i)},${y(v)}`).join("L") + "L" + lower.map((v, i) => `${x(i)},${y(v)}`).reverse().join("L") + "Z";
      areas += `<path class="area area--${c}" d="${d}"/>`;
    });
    let grid = "";
    for (let q = 0; q <= 3; q++) { const v = (maxY / 3) * q; grid += `<line class="ch-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-label" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`; }
    const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 70))));
    for (let i = 0; i <= n; i += step) grid += `<text class="ch-label" x="${x(i)}" y="${H - 8}" text-anchor="middle">${rows[i].age}</text>`;
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${grid}${areas}</svg>
      <ul class="legend legend--chart"><li><i class="sw sw--trad"></i>Traditional</li><li><i class="sw sw--taxable"></i>Taxable</li><li><i class="sw sw--roth"></i>Roth</li></ul>`;
  }

  /* ---------- VII. THE LEDGER ---------- */
  function donut(el, segs, centerTop, centerSub) {
    const total = segs.reduce((a, s) => a + Math.max(0, s.v), 0);
    const R = 70, Cc = 2 * Math.PI * R;
    let off = 0, arcs = "";
    if (total > 0) segs.forEach((s) => {
      const len = (Math.max(0, s.v) / total) * Cc;
      if (len <= 0) return;
      arcs += `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${s.c}" stroke-width="22" stroke-dasharray="${Math.max(0, len - 1.5)} ${Cc}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"><title>${esc(s.label)}: ${money(s.v)}</title></circle>`;
      off += len;
    });
    el.innerHTML = `<svg viewBox="0 0 180 180" class="donut__svg" aria-hidden="true"><circle cx="90" cy="90" r="${R}" fill="none" class="donut__track" stroke-width="22"/>${arcs}
        <text x="90" y="88" text-anchor="middle" class="donut__top">${esc(centerTop)}</text><text x="90" y="108" text-anchor="middle" class="donut__sub">${esc(centerSub)}</text></svg>
      <ul class="legend legend--donut">${segs.filter((s) => s.v > 0).map((s) => `<li><i class="sw" style="background:${s.c}"></i><span>${esc(s.label)}</span><b>${s.fmt ? s.fmt(s.v) : compact(s.v) + (total > 0 ? ` · ${Math.round((s.v / total) * 100)}%` : "")}</b></li>`).join("")}</ul>`;
  }

  let calYear = BASE;
  function renderLedger() {
    const pic = state.picture, sv = Math.max(0, (pic.invest + state.extraMonthly) * 12);
    const segs = [{ label: "Living expenses", v: Math.min(pic.expenses, pic.income), c: "var(--ink-faint)" }];
    const spare = pic.income - pic.expenses - sv;
    if (spare > 1) segs.push({ label: "Left over, not invested", v: spare, c: "var(--line-soft)" });
    if (C.plan) {
      const r = E.portfolio(C.plan.level, state.beliefs.esg).mu;
      const marks = earmarks(C.m.goals, C.plan.decisions, pic.networth, r, C.m.base.retireIdx);
      const tot = marks.reduce((a, b) => a + (b >= 500 ? b : 0), 0), scale = tot > sv ? sv / tot : 1;
      C.m.goals.forEach((g, i) => { if (marks[i] * scale >= 500) segs.push({ label: g.name, v: marks[i] * scale, c: goalColor(g) }); });
      const rest = sv - tot * scale;
      if (rest > 1) segs.push({ label: "Saved, not yet set aside for a goal", v: rest, c: "var(--line)" });
    } else if (sv > 0) segs.push({ label: "Savings", v: sv, c: "var(--g0)" });
    segs.forEach((sg) => (sg.v = per(sg.v)));
    donut($("#donut-income"), segs, compact(per(pic.income)), period().word);

    const L = C.plan ? C.plan.level : state.beliefs.tolerance, R = E.RISK[L];
    const asPct = (v) => Math.round(v) + "%", mix = C.plan ? C.plan.result.mixNow : R.mix;
    donut($("#donut-mix"), [
      { label: "Stocks", v: mix.stocks, c: "var(--c-stocks)", fmt: asPct },
      { label: "Bonds", v: mix.bonds, c: "var(--c-bonds)", fmt: asPct },
      { label: "Cash", v: mix.cash, c: "var(--c-cash)", fmt: asPct },
    ], C.plan ? "Today" : R.name, C.plan ? "all goals" : state.beliefs.esg ? "ESG-screened" : "portfolio");

    const a = C.ret.atRetirement;
    donut($("#donut-accounts"), [
      { label: "Traditional", v: a.trad, c: "var(--c-trad)" },
      { label: "Taxable", v: a.taxable, c: "var(--c-taxable)" },
      { label: "Roth", v: a.roth, c: "var(--c-roth)" },
    ], compact(a.trad + a.taxable + a.roth), "at " + retireAges(state).retireAge);

    renderCalendar();
  }

  function renderCalendar() {
    $("#cal-year").textContent = calYear;
    $("#cal-prev").disabled = calYear <= BASE;
    $("#cal-next").disabled = calYear >= BASE + E.MAX_YEARS - 1;
    const now = new Date();
    const m = C.m, monthly = m.savings / 12;
    const retYear = m.base.retireIdx === Infinity ? Infinity : BASE + m.base.retireIdx;
    const cash = state.cashflows.filter((c) => c.year === calYear);
    $("#calendar").innerHTML = MONTHS.map((name, mi) => {
      const past = calYear === BASE && mi < now.getMonth();
      const isNow = calYear === now.getFullYear() && mi === now.getMonth();
      const items = [];
      if (calYear < retYear && monthly) items.push(`<li class="cal__save">${monthly >= 0 ? "Save" : "Short by"} ${compact(Math.abs(monthly))}</li>`);
      if (mi === 0 && calYear === retYear) items.push(`<li class="cal__goal" style="--gc:var(--g-r)">Retirement starts</li>`);
      if (mi === 0) cash.forEach((c) => items.push(`<li class="cal__cash">${c.amount < 0 ? "Take out" : "Add"} ${compact(Math.abs(c.amount))}</li>`));
      if (C.plan) m.goals.forEach((g, i) => {
        if (g.kind === "goal" && g.year === calYear && g.month === mi) {
          const d = C.plan.decisions[i];
          items.push(`<li class="cal__goal" style="--gc:${goalColor(g)}">${esc(g.name)}<small>${d === 0 ? "set aside" : compact(d === 2 ? g.partial : g.cost) + " · " + pct(oddsOf(C.plan.result, d, i))}</small></li>`);
        }
      });
      return `<div class="cal__month${past ? " is-past" : ""}${isNow ? " is-now" : ""}"><h4>${name}</h4><ul>${items.join("")}</ul></div>`;
    }).join("");
  }

  /* ============================================================
     INPUTS
     ============================================================ */
  function formatMoneyInput(input) {
    const raw = input.value.replace(/[^0-9]/g, "");
    input.value = raw === "" ? "" : Number(raw).toLocaleString("en-US");
  }

  function fillForms() {
    $$("[data-bind]").forEach((el) => {
      const v = getPath(state, el.dataset.bind);
      if (el.type === "checkbox") el.checked = !!v;
      else if (!v) el.value = "";
      else if (el.dataset.flow) el.value = shownFlow(v, el.dataset.flow).toLocaleString("en-US");
      else if (el.hasAttribute("data-money")) el.value = Number(v).toLocaleString("en-US");
      else el.value = v;
    });
    syncPeriod();
    $("#cash-year").value = "";
  }

  /* money fields: digits only, thousands separators while typing */
  $$("[data-money]").forEach((input) => {
    input.addEventListener("input", () => {
      const fromEnd = input.value.length - input.selectionStart;
      formatMoneyInput(input);
      const p = Math.max(0, input.value.length - fromEnd);
      try { input.setSelectionRange(p, p); } catch (_) {}
    });
  });
  $$("[data-money], [data-int]").forEach((input) => {
    input.addEventListener("keypress", (e) => { if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault(); });
  });

  /* bound fields write straight into state */
  $$("[data-bind]").forEach((el) => {
    const ev = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(ev, () => {
      const v = el.type === "checkbox" ? el.checked : el.dataset.flow ? storedFlow(parseNum(el.value), el.dataset.flow) : parseNum(el.value);
      setPath(state, el.dataset.bind, v);
      $$(`[data-bind="${el.dataset.bind}"]`).forEach((o) => { if (o !== el && o.type !== "checkbox") o.value = el.value; });
      if (el.dataset.bind === "picture.age") renderAgeRule();
      commit();
    });
  });

  $("#focus-goal").addEventListener("change", (e) => { state.focus = e.target.value; save(); renderPicture(); });

  /* the what-if slider moves in the chosen period too: up to $24,000 a year more */
  const EXTRA_STEP = { year: 300, month: 25, biweek: 10 };
  function syncExtra() {
    const x = $("#extra"), step = EXTRA_STEP[state.period] || 300;
    x.step = step;
    x.max = Math.round(24000 / period().n / step) * step;
    x.value = Math.round(per(state.extraMonthly * 12) / step) * step;
    $("#extra-out").textContent = "+" + flow(state.extraMonthly * 12);
    syncRange(x);
  }
  $("#extra").addEventListener("input", (e) => {
    state.extraMonthly = (+e.target.value * period().n) / 12;
    $("#extra-out").textContent = "+" + flow(state.extraMonthly * 12);
    commit(90);
  });

  /* the period picker sits on several pages; all of them stay in step */
  function syncPeriod() {
    $$("[data-period] input").forEach((el) => (el.checked = el.value === state.period));
    $$("[data-per]").forEach((el) => (el.textContent = "/ " + period().short));
    syncExtra();
  }
  $$("[data-period] input").forEach((el) => el.addEventListener("change", () => {
    if (!el.checked) return;
    state.period = el.value;
    fillForms();
    save();
    if (C) renderAll();
  }));

  $$('input[name="ret-mode"]').forEach((el) => el.addEventListener("change", () => { state.retirement.mode = el.value; commit(); }));

  $("#tolerance").addEventListener("input", (e) => { state.beliefs.tolerance = +e.target.value; fanLevel = null; renderBeliefs(); commit(); });
  $("#esg").addEventListener("change", (e) => { state.beliefs.esg = e.target.checked; renderBeliefs(); commit(); });

  /* ranking: moving a goal swaps its weight with its neighbour */
  $("#rank-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rank]");
    if (!b) return;
    const items = rankItems(), i = items.findIndex((it) => it.id === b.dataset.rank), j = i + +b.dataset.dir;
    if (j < 0 || j >= items.length) return;
    let wi = items[j].importance, wj = items[i].importance;
    if (wi === wj) { if (j < i) wi = Math.min(10, wi + 1); else wi = Math.max(1, wi - 1); if (wi === wj) wj = j < i ? wj - 1 : wj + 1; }
    const setW = (id, w) => { w = clamp(w, 1, 10); if (id === "retire") state.retirement.importance = w; else state.goals.find((g) => g.id === id).importance = w; };
    setW(items[i].id, wi); setW(items[j].id, wj);
    renderBeliefs(b.dataset.rank, b.dataset.dir);
    commit();
  });

  /* renaming in place: Enter or leaving the field saves, Escape undoes */
  $("#rank-list").addEventListener("change", (e) => {
    const inp = e.target.closest("[data-rename]");
    if (!inp) return;
    const id = inp.dataset.rename, name = inp.value.trim().slice(0, 60);
    if (id === "retire") state.retirement.label = name;
    else if (name) state.goals.find((g) => g.id === id).name = name;
    else { inp.value = state.goals.find((g) => g.id === id).name; return; }
    commit();
  });
  $("#rank-list").addEventListener("keydown", (e) => {
    const inp = e.target.closest("[data-rename]");
    if (!inp) return;
    if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
    else if (e.key === "Escape") { inp.value = inp.defaultValue; inp.blur(); }
  });

  /* ---------- goal form (add / edit) ---------- */
  const form = $("#goal-form");
  let editingId = null;
  $("#g-month").innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join("");
  $("#g-importance").addEventListener("input", (e) => ($("#g-importance-out").textContent = e.target.value));

  function openGoalForm(goal) {
    editingId = goal ? goal.id : null;
    $("#goal-form-title").textContent = goal ? "Edit goal" : "A new goal";
    $("#goal-save").textContent = goal ? "Save changes" : "Add goal";
    $("#g-name").value = goal ? goal.name : "";
    $("#g-cost").value = goal ? goal.cost.toLocaleString("en-US") : "";
    $("#g-month").value = goal ? goal.month : 5;
    $("#g-year").value = goal ? goal.year : "";
    $("#g-partial").value = goal && goal.partial ? goal.partial.toLocaleString("en-US") : "";
    $("#g-importance").value = goal ? goal.importance : 6;
    $("#g-importance-out").textContent = $("#g-importance").value;
    $("#goal-form-error").textContent = "";
    form.hidden = false;
    form.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    $("#g-name").focus({ preventScroll: true });
  }
  function closeGoalForm() { form.hidden = true; editingId = null; $("#add-goal").focus(); }

  $("#add-goal").addEventListener("click", () => openGoalForm(null));
  $("#goal-cancel").addEventListener("click", closeGoalForm);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#g-name").value.trim(), cost = parseNum($("#g-cost").value), year = Math.round(parseNum($("#g-year").value));
    const partial = parseNum($("#g-partial").value);
    const month = +$("#g-month").value;
    const err = !name ? "Give the goal a name." : cost <= 0 ? "Enter what it costs." : year < BASE || year > BASE + E.MAX_YEARS - 1 ? `Pick a year between ${BASE} and ${BASE + E.MAX_YEARS - 1}.` : year === BASE && month < new Date().getMonth() ? "That month has already passed. Pick a later one." : partial >= cost ? "The smaller version should cost less than the full goal." : "";
    if (err) { $("#goal-form-error").textContent = err; return; }
    const data = { name, cost, year, month, partial, importance: +$("#g-importance").value };
    if (editingId) Object.assign(state.goals.find((g) => g.id === editingId), data);
    else {
      const used = new Set(state.goals.map((g) => g.color));
      let color = 0; while (used.has(color) && color < 6) color++;
      state.goals.push({ id: "g" + Date.now().toString(36), color: color % 6, ...data });
    }
    form.hidden = true; editingId = null;
    commit(0);
  });

  /* the same actions work on the goal list (II) and the plan's cards (IV) */
  let editAfterRoute = null;
  const onCardAction = (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.closest(".card").dataset.id, act = b.dataset.act;
    if (id === "retire") { if (act === "extend") { state.retirement.age += 1; fillForms(); commit(0); } return; }
    const g = state.goals.find((x) => x.id === id);
    if (act === "edit" && currentView !== "goals") { editAfterRoute = g; location.hash = "goals"; return; }
    if (act === "edit") openGoalForm(g);
    if (act === "extend") { g.year = Math.min(BASE + E.MAX_YEARS - 1, g.year + 1); commit(0); }
    if (act === "remove") {
      if (b.dataset.confirm) { state.goals = state.goals.filter((x) => x.id !== id); commit(0); return; }
      b.dataset.confirm = "1"; b.textContent = "Remove it?";
      setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = "Remove"; } }, 3500);
    }
  };
  $("#goal-list").addEventListener("click", onCardAction);
  $("#goal-cards").addEventListener("click", onCardAction);

  /* ---------- beliefs: take the suggested level ---------- */
  $("#suggest").addEventListener("click", (e) => {
    const b = e.target.closest("#use-suggest");
    if (!b) return;
    state.beliefs.tolerance = +b.dataset.level; fanLevel = null;
    renderBeliefs(); commit(0);
    $("#tolerance").focus();
  });

  $("#age-rule").addEventListener("click", (e) => {
    const b = e.target.closest("#use-age");
    if (!b) return;
    state.beliefs.tolerance = +b.dataset.level; fanLevel = null;
    renderBeliefs(); commit(0);
    $("#tolerance").focus();
  });

  /* ---------- retirement: keep the schedule ---------- */
  $("#ret-csv").addEventListener("click", downloadCSV);
  $("#ret-print").addEventListener("click", printPage);
  $("#plan-csv").addEventListener("click", downloadPlanCSV);
  $("#footer-csv").addEventListener("click", downloadPlanCSV);

  /* ---------- plan: cash in/out, windfall, review ---------- */
  $("#cash-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const dir = $('input[name="cash-dir"]:checked').value, amt = parseNum($("#cash-amt").value);
    const year = clamp(Math.round(parseNum($("#cash-year").value)) || BASE, BASE, BASE + E.MAX_YEARS - 1);
    if (amt <= 0) return;
    const signed = dir === "out" ? -amt : amt;
    propose(`${dir === "out" ? "Take out" : "Add"} ${money(amt)} in ${year}`, (s) => s.cashflows.push({ id: "c" + Date.now().toString(36), year, amount: signed }));
  });

  $("#cash-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cash]");
    if (!b) return;
    state.cashflows = state.cashflows.filter((c) => c.id !== b.dataset.cash);
    commit(0);
  });

  $("#windfall-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const amt = parseNum($("#wf-amt").value), gid = $("#wf-goal").value;
    const box = $("#wf-options");
    if (amt <= 0 || !gid || !C.plan) return;
    pending = null; $("#review").hidden = true;
    const goal = state.goals.find((g) => g.id === gid);
    const addCash = (s) => s.cashflows.push({ id: "c" + Date.now().toString(36), year: BASE, amount: amt });
    const curL = C.plan.level, lower = Math.max(0, curL - 1);
    const options = [
      { key: "up", title: `Upgrade ${goal.name}`, sub: `Its budget goes from ${compact(goal.cost)} to ${compact(goal.cost + amt)}.`,
        mutate: (s) => { addCash(s); s.goals.find((g) => g.id === gid).cost += amt; } },
      { key: "safe", title: curL > 0 ? `Take less risk: ${E.RISK[lower].name}` : "Keep it at Cautious and save it",
        sub: curL > 0 ? `Goals stay the same. Your limit drops from ${E.RISK[state.beliefs.tolerance].name} to ${E.RISK[lower].name}.` : "You're already at the lowest risk, so the money is simply added.",
        mutate: (s) => { addCash(s); s.beliefs.tolerance = Math.min(s.beliefs.tolerance, lower); } },
    ];
    options.forEach((o) => { const n = clone(state); o.mutate(n); o.res = planFor(n); });
    box.innerHTML = options.map((o, k) => {
      const list = o.res.plan ? o.res.m.goals.map((g, i) => `<li><span class="dot" style="--gc:${goalColor(g)}"></span>${esc(g.name)}<b>${o.res.plan.decisions[i] === 0 ? "set aside" : pct(oddsOf(o.res.plan.result, o.res.plan.decisions[i], i))}</b></li>`).join("") : "";
      return `<div class="wf-option"><p class="wf-option__title">${esc(o.title)}</p><p class="section-note">${esc(o.sub)}</p>
        <ul class="wf-option__list">${list}</ul>
        <p class="wf-option__share">${o.res.plan ? pct(o.res.plan.result.share) : "—"} <span>of what you care about · ${o.res.plan ? E.RISK[o.res.plan.level].name : ""}</span></p>
        <button type="button" class="btn btn--ghost" data-wf="${k}">Choose this</button></div>`;
    }).join("");
    box._options = options;
  });

  $("#wf-options").addEventListener("click", (e) => {
    const b = e.target.closest("[data-wf]");
    if (!b) return;
    const o = $("#wf-options")._options[+b.dataset.wf];
    propose(o.title, o.mutate);
  });

  $("#review-confirm").addEventListener("click", () => {
    if (!pending) return;
    pending.mutate(state);
    pending = null;
    $("#review").hidden = true;
    $("#wf-options").innerHTML = "";
    fillForms();
    commit(0);
  });
  $("#review-discard").addEventListener("click", () => { pending = null; $("#review").hidden = true; });

  /* ---------- odds: pick a level for the fan chart ---------- */
  $("#fan-levels").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fan]");
    if (!b) return;
    fanLevel = +b.dataset.fan;
    renderOdds(); renderFan();
    const nb = $(`#fan-levels [data-fan="${fanLevel}"]`); if (nb) nb.focus();
  });

  /* ---------- calendar ---------- */
  $("#cal-prev").addEventListener("click", () => { calYear = Math.max(BASE, calYear - 1); renderCalendar(); });
  $("#cal-next").addEventListener("click", () => { calYear = Math.min(BASE + E.MAX_YEARS - 1, calYear + 1); renderCalendar(); });

  /* ---------- reset ---------- */
  $("#reset").addEventListener("click", () => {
    state = { ...clone(EXAMPLE), period: state.period };
    pending = null; $("#review").hidden = true; fanLevel = null; calYear = BASE;
    fillForms(); commit(0);
  });

  /* ============================================================
     ROUTING
     ============================================================ */
  function show(v, initial) {
    currentView = v;
    $$(".view").forEach((sec) => {
      const on = sec.dataset.view === v;
      sec.hidden = !on;
      sec.classList.toggle("is-active", on);
    });
    $$("[data-nav]").forEach((a) => { if (a.dataset.nav === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    const cur = $(`[data-nav="${v}"]`);
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "center" });
    if (!initial) {
      window.scrollTo({ top: 0, behavior: "auto" });
      const h = $(`.view[data-view="${v}"] h1, .view[data-view="${v}"] h2`);
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
    renderCharts(v);
    if (v === "goals" && editAfterRoute) { const g = editAfterRoute; editAfterRoute = null; openGoalForm(g); }
  }

  /* every page ends by pointing to the one before and the one after */
  VIEWS.forEach((v, i) => {
    const prev = VIEWS[i - 1], next = VIEWS[i + 1];
    const nav = document.createElement("nav");
    nav.className = "pager";
    nav.setAttribute("aria-label", "Next and previous section");
    nav.innerHTML = (prev ? `<a class="pager__prev" href="#${prev}"><small>← Back</small><span>${VIEW_NAMES[prev]}</span></a>` : "<span></span>")
      + (next ? `<a class="pager__next" href="#${next}"><small>Next →</small><span>${VIEW_NAMES[next]}</span></a>` : "");
    $(`.view[data-view="${v}"]`).appendChild(nav);
  });
  function route(initial) {
    const v = location.hash.slice(1);
    show(VIEWS.includes(v) ? v : "picture", initial);
  }
  window.addEventListener("hashchange", () => route(false));

  /* redraw charts at the new width */
  let rz = null;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => renderCharts(currentView), 150); });

  /* fade the contents bar's edges when there are more sections off to either side */
  const tocList = $(".toc ol"), tocNav = $(".toc");
  function syncTocEdges() {
    const max = tocList.scrollWidth - tocList.clientWidth;
    tocNav.classList.toggle("has-more-left", tocList.scrollLeft > 4);
    tocNav.classList.toggle("has-more-right", tocList.scrollLeft < max - 4);
  }
  tocList.addEventListener("scroll", syncTocEdges, { passive: true });
  window.addEventListener("resize", syncTocEdges);
  requestAnimationFrame(syncTocEdges);

  /* ---------- theme ---------- */
  const root = document.documentElement, toggle = $("#theme-toggle");
  function syncToggle() {
    const dark = root.getAttribute("data-theme") === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }
  toggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("atco-theme", next); } catch (_) {}
    syncToggle();
  });
  syncToggle();

  /* ---------- boot ---------- */
  fillForms();
  route(true);
  run();
  requestAnimationFrame(() => document.body.classList.add("is-ready"));
})();
