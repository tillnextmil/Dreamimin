/* ============================================================
   Pie chart for step 1: recorded spending by category, as a
   ring of slices from 12 o'clock, clockwise, in the order given
   (largest first). Each slice has class "pie-slice" and the
   category in data-key, so the stylesheet colours it and the
   money view can link it to its legend row.

   build() only turns numbers into SVG markup, so it runs in the
   tests too.
   ============================================================ */

(function (global) {
  "use strict";

  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const round = (n) => Math.round(n * 100) / 100;

  /* the point at `angle` (radians, 0 at 12 o'clock, clockwise) on a circle of radius r around (c, c) */
  const at = (c, r, angle) => [round(c + r * Math.sin(angle)), round(c - r * Math.cos(angle))];

  /* a ring slice from angle a0 to a1 between radii inner and outer */
  function slicePath(c, outer, inner, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = at(c, outer, a0), [x1, y1] = at(c, outer, a1);
    const [x2, y2] = at(c, inner, a1), [x3, y3] = at(c, inner, a0);
    return `M${x0},${y0}A${outer},${outer} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${inner},${inner} 0 ${large} 0 ${x3},${y3}Z`;
  }

  /* the whole ring, for a single slice: two half rings, since one arc can't start and end at the same point */
  const ringPath = (c, outer, inner) => slicePath(c, outer, inner, 0, Math.PI) + slicePath(c, outer, inner, Math.PI, 2 * Math.PI);

  /* slices: [{ key, value, label }] with values above 0, in the order to draw them; size is the
     width and height in px; thickness is the ring's width. Returns { svg, slices }, where each
     slice adds its share (0 to 1) and its path. */
  function build({ slices, size = 148, thickness = 22 }) {
    const shown = slices.filter((s) => s.value > 0);
    const total = shown.reduce((sum, s) => sum + s.value, 0);
    const c = size / 2, outer = c - 1, inner = Math.max(1, outer - thickness);
    let angle = 0;
    const drawn = shown.map((s) => {
      const share = s.value / total;
      const a0 = angle, a1 = angle + share * 2 * Math.PI;
      angle = a1;
      const path = shown.length === 1 ? ringPath(c, outer, inner) : slicePath(c, outer, inner, a0, a1);
      return { ...s, share, path };
    });
    const parts = drawn.map((s) => `<path class="pie-slice" data-key="${escape(s.key)}" d="${s.path}"><title>${escape(s.label ?? s.key)}</title></path>`);
    const track = total > 0 ? "" : `<path class="pie-track" d="${ringPath(c, outer, inner)}"/>`;
    const svg = `<svg class="pie" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">${track}${parts.join("")}</svg>`;
    return { svg, slices: drawn };
  }

  const PieChart = { build };
  if (typeof module !== "undefined" && module.exports) module.exports = PieChart;
  else (global.Dreamimin = global.Dreamimin || {}).PieChart = PieChart;
})(typeof window !== "undefined" ? window : globalThis);
