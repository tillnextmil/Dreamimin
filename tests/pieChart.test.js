// Unit tests for the step 1 spending chart (client/views/pieChart.js): the slices it draws and
// the SVG it builds.
// Author: Aiyan Tong

const PieChart = require("../client/views/pieChart");

const SLICES = [
  { key: "housing", value: 1200, label: "Housing: $1,200.00" },
  { key: "transport", value: 125, label: "Transport: $125.00" },
  { key: "food", value: 75, label: "Food: $75.00" },
];
const paths = (svg) => [...svg.matchAll(/class="pie-slice" data-key="([^"]+)" d="([^"]+)"/g)].map((m) => ({ key: m[1], d: m[2] }));

// normal case: one slice per category, in the order given, each with its share
test("draws one slice per category, in order", () => {
  const { svg, slices } = PieChart.build({ slices: SLICES, size: 148 });
  expect(paths(svg).map((p) => p.key)).toEqual(["housing", "transport", "food"]);
  expect(slices.map((s) => s.share)).toEqual([1200 / 1400, 125 / 1400, 75 / 1400]);
  expect(svg).toContain("<title>Housing: $1,200.00</title>");
  expect(svg).not.toMatch(/NaN|undefined|Infinity/);
});

// normal case: the first slice starts at 12 o'clock and the last ends there
test("goes clockwise from 12 o'clock", () => {
  const { slices } = PieChart.build({ slices: SLICES, size: 148 });
  expect(slices[0].path.startsWith("M74,1A")).toBe(true);
  expect(slices[2].path).toMatch(/A73,73 0 0 1 74,1L/);
});

// normal case: a slice of more than half the ring takes the long way round
test("draws a slice over half the ring the long way round", () => {
  const { slices } = PieChart.build({ slices: SLICES, size: 148 });
  expect(slices[0].path).toMatch(/A73,73 0 1 1/);   // 86% of the ring
  expect(slices[1].path).toMatch(/A73,73 0 0 1/);
});

// edge case: one category fills the whole ring
test("draws a whole ring for a single category", () => {
  const { svg } = PieChart.build({ slices: [{ key: "food", value: 40 }], size: 148 });
  const [only] = paths(svg);
  expect(only.d.match(/M/g)).toHaveLength(2);   // two half rings
});

// edge case: a slice worth $0 isn't drawn, and nothing at all leaves an empty track
test("leaves out empty slices", () => {
  expect(paths(PieChart.build({ slices: [...SLICES, { key: "fun", value: 0 }] }).svg)).toHaveLength(3);
  const { svg } = PieChart.build({ slices: [] });
  expect(svg).toContain('class="pie-track"');
  expect(svg).not.toMatch(/NaN|Infinity/);
});

// wrong case: keys and labels can't add markup
test("escapes keys and labels", () => {
  const { svg } = PieChart.build({ slices: [{ key: '"><b>', value: 1, label: "<script>" }, { key: "food", value: 1 }] });
  expect(svg).not.toContain("<script>");
  expect(svg).not.toContain('"><b>');
  expect(svg).toContain("&lt;script&gt;");
});
