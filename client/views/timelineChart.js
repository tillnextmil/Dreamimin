/* ============================================================
   Timeline chart for step 3: the money for goals over time, as
   a band from a bad market to a good one (10th to 90th
   percentile) with the typical market (50th) as a line, a drop
   where each goal is paid, and a dashed line at each goal date.

   build() only turns numbers into SVG markup and positions, so
   it runs in the tests too; the odds view puts the markup on
   the page and handles pointer and keyboard.
   ============================================================ */

(function (global) {
  "use strict";

  const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const LABEL_ROW = 16;          // height of one row of goal labels above the plot
  const MAX_LABEL_ROWS = 3;
  const CHAR_WIDTH = 6.4;        // rough width of one 12px character, to keep goal labels apart
  const MAX_LABEL_CHARS = 20;

  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const round = (n) => Math.round(n * 10) / 10;
  const shorten = (text) => (text.length > MAX_LABEL_CHARS ? text.slice(0, MAX_LABEL_CHARS - 1).trimEnd() + "…" : text);

  /* a round step for about `count` gridlines up to max: 1, 2, 2.5 or 5 times a power of ten */
  function niceStep(max, count = 4) {
    if (!(max > 0)) return 1000;
    const raw = max / count;
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map((m) => m * power).find((step) => step >= raw);
  }

  /* months from today at which a new calendar year starts, up to lastMonth: [{ month, year }] */
  function yearTicks(today, lastMonth) {
    const ticks = [];
    for (let month = (12 - today.getMonth()) % 12; month <= lastMonth; month += 12) {
      ticks.push({ month, year: today.getFullYear() + (today.getMonth() + month) / 12 });
    }
    return ticks;
  }

  /* points: the planner's timeline, [{ month, p10, p50, p90, before: { p10, p50, p90 } }];
     start: the money at month 0; goals: [{ name, months }]; today: a Date; width and height in px.
     Returns { svg, stops, plot }: stops are the points the pointer can rest on, month 0 first,
     each { month, x, p10, p50, p90, goals: [names paid at that month] }. */
  function build({ points, start, goals = [], today = new Date(), width = 640, height = 240 }) {
    const all = [{ month: 0, p10: start, p50: start, p90: start }, ...points];
    const lastMonth = all[all.length - 1].month || 1;

    /* goal labels: goals due the same month share one, and each label takes the first row with room */
    const byMonth = new Map();
    for (const goal of goals) byMonth.set(goal.months, [...(byMonth.get(goal.months) || []), goal.name]);
    const left = 56, right = 16, bottom = 28;
    const plotWidth = Math.max(40, width - left - right);
    const x = (month) => round(left + (plotWidth * month) / lastMonth);
    const rowEnds = [];
    const labels = [...byMonth].sort((a, b) => a[0] - b[0]).map(([month, names]) => {
      const text = shorten(names.length === 1 ? names[0] : `${names[0]} + ${names.length - 1} more`);
      const w = text.length * CHAR_WIDTH + 8;
      const cx = x(month);
      const anchor = cx - w / 2 < 4 ? "start" : cx + w / 2 > width - 4 ? "end" : "middle";
      const from = anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2;
      let row = rowEnds.findIndex((end) => end < from);
      if (row === -1) row = rowEnds.length < MAX_LABEL_ROWS ? rowEnds.length : MAX_LABEL_ROWS - 1;
      rowEnds[row] = from + w;
      return { month, names, text, x: cx, row, anchor };
    });
    const top = 8 + Math.max(1, rowEnds.length) * LABEL_ROW + 6;
    const plotBottom = height - bottom;

    /* y: $0 at the bottom up to a round amount above the highest good-market value */
    const highest = Math.max(...all.flatMap((p) => [p.p90, p.before ? p.before.p90 : 0]));
    const step = niceStep(highest);
    const yTop = Math.max(step, Math.ceil(highest / step) * step);
    const y = (value) => round(plotBottom - ((plotBottom - top) * Math.max(0, value)) / yTop);

    /* each percentile's path: at a stop, the money before that stop's goals, then after */
    const vertices = (key) => all.flatMap((p) => (p.before ? [[p.month, p.before[key]], [p.month, p[key]]] : [[p.month, p[key]]]));
    const line = (pts) => pts.map(([m, v], i) => `${i ? "L" : "M"}${x(m)},${y(v)}`).join("");
    const upper = vertices("p90"), lower = vertices("p10").reverse();
    const band = line([...upper, ...lower]) + "Z";

    const parts = [];
    for (let value = 0; value <= yTop + 1e-9; value += step) {
      parts.push(`<line class="tl-grid" x1="${left}" x2="${left + plotWidth}" y1="${y(value)}" y2="${y(value)}"/>`);
      parts.push(`<text class="tl-tick" x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${escape(compact.format(value))}</text>`);
    }
    const years = yearTicks(today, lastMonth);
    const every = Math.max(1, Math.ceil(years.length / Math.max(1, Math.floor(plotWidth / 64))));
    years.forEach(({ month, year }, i) => {
      if (i % every) return;
      parts.push(`<text class="tl-tick" x="${x(month)}" y="${plotBottom + 20}" text-anchor="middle">${year}</text>`);
    });
    for (const label of labels) {
      parts.push(`<line class="tl-goal" x1="${label.x}" x2="${label.x}" y1="${top - 4}" y2="${plotBottom}"/>`);
      const ly = 8 + label.row * LABEL_ROW + 11;
      parts.push(`<text class="tl-goal-label" x="${label.x}" y="${ly}" text-anchor="${label.anchor}"><title>${escape(label.names.join(", "))}</title>${escape(label.text)}</text>`);
    }
    parts.push(`<path class="tl-band" d="${band}"/>`);
    parts.push(`<path class="tl-line" d="${line(vertices("p50"))}"/>`);
    parts.push(`<line class="tl-axis" x1="${left}" x2="${left + plotWidth}" y1="${plotBottom}" y2="${plotBottom}"/>`);
    parts.push(`<line class="tl-guide" x1="0" x2="0" y1="${top - 4}" y2="${plotBottom}" visibility="hidden"/>`);
    parts.push(`<circle class="tl-dot" cx="0" cy="0" r="5" visibility="hidden"/>`);

    const svg = `<svg class="tl" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">${parts.join("")}</svg>`;
    const stops = all.map((p) => ({
      month: p.month, x: x(p.month), y: y(p.p50),
      p10: p.p10, p50: p.p50, p90: p.p90,
      goals: byMonth.get(p.month) || [],
    }));
    return { svg, stops, plot: { left, right: left + plotWidth, top, bottom: plotBottom }, yTop, step };
  }

  const TimelineChart = { build, niceStep, yearTicks };
  if (typeof module !== "undefined" && module.exports) module.exports = TimelineChart;
  else (global.Dreamimin = global.Dreamimin || {}).TimelineChart = TimelineChart;
})(typeof window !== "undefined" ? window : globalThis);
