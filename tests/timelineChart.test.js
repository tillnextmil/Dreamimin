// Unit tests for the step 3 timeline chart (client/views/timelineChart.js): the gridline steps,
// the year ticks, and the SVG and positions it builds from the planner's timeline.
// Author: Aiyan Tong

const TimelineChart = require("../client/views/timelineChart");

const TODAY = new Date(2026, 10, 23);   // Nov 23, 2026
// A trip at month 8 and a car at month 30, with yearly stops in between.
const POINTS = [
  { month: 8, p10: 9000, p50: 11000, p90: 13000, before: { p10: 15000, p50: 17000, p90: 19000 } },
  { month: 12, p10: 13000, p50: 15500, p90: 18000, before: { p10: 13000, p50: 15500, p90: 18000 } },
  { month: 24, p10: 26000, p50: 30000, p90: 35000, before: { p10: 26000, p50: 30000, p90: 35000 } },
  { month: 30, p10: 4000, p50: 9000, p90: 15000, before: { p10: 29000, p50: 34000, p90: 40000 } },
];
const GOALS = [{ name: "Trip", months: 8 }, { name: "Car", months: 30 }];
const build = (changes = {}) => TimelineChart.build({ points: POINTS, start: 12000, goals: GOALS, today: TODAY, width: 600, height: 240, ...changes });

describe("niceStep", () => {
  // normal case: about four gridlines, on round amounts
  test.each([
    [87000, 25000],
    [40000, 10000],
    [3100, 1000],
    [1_200_000, 500000],
  ])("steps up to %p in %p", (max, step) => {
    expect(TimelineChart.niceStep(max)).toBe(step);
  });

  // edge case: nothing to show still gets a step
  test("has a step when every amount is $0", () => {
    expect(TimelineChart.niceStep(0)).toBe(1000);
  });
});

describe("yearTicks", () => {
  // normal case: a tick where each calendar year starts
  test("starts each year in January", () => {
    expect(TimelineChart.yearTicks(TODAY, 30)).toEqual([{ month: 2, year: 2027 }, { month: 14, year: 2028 }, { month: 26, year: 2029 }]);
  });

  // edge case: in January the first tick is today
  test("ticks this year when today is in January", () => {
    expect(TimelineChart.yearTicks(new Date(2027, 0, 5), 12)).toEqual([{ month: 0, year: 2027 }, { month: 12, year: 2028 }]);
  });
});

describe("build", () => {
  // normal case: the stops run from today to the last goal, across the plot
  test("has a stop for today and each point, left to right", () => {
    const { stops, plot } = build();
    expect(stops.map((s) => s.month)).toEqual([0, 8, 12, 24, 30]);
    expect(stops[0]).toMatchObject({ p10: 12000, p50: 12000, p90: 12000, x: plot.left, goals: [] });
    expect(stops[stops.length - 1].x).toBe(plot.right);
    expect(stops.map((s) => s.goals)).toEqual([[], ["Trip"], [], [], ["Car"]]);
    for (let i = 1; i < stops.length; i++) expect(stops[i].x).toBeGreaterThan(stops[i - 1].x);
  });

  // normal case: the typical-market line drops where a goal is paid
  test("draws the drop where each goal is paid", () => {
    const { svg, stops } = build();
    const trip = stops[1];
    const line = svg.match(/class="tl-line" d="([^"]+)"/)[1];
    expect(line).toMatch(new RegExp(`L${trip.x},[\\d.]+L${trip.x},${trip.y}`));   // straight down at the trip
  });

  // normal case: gridlines from $0 to a round amount above the best market
  test("labels the amounts and the years", () => {
    const { svg, yTop, step } = build();
    expect(step).toBe(10000);
    expect(yTop).toBe(40000);
    for (const label of ["$0", "$10K", "$20K", "$30K", "$40K", "2027", "2028", "2029"]) expect(svg).toContain(`>${label}</text>`);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  // normal case: a dashed line and a label at each goal date
  test("marks each goal date", () => {
    const { svg } = build();
    expect(svg.match(/class="tl-goal"/g)).toHaveLength(2);
    expect(svg).toContain(">Trip</text>");
    expect(svg).toContain(">Car</text>");
  });

  // edge case: goals due the same month share one label
  test("shares one label between goals due the same month", () => {
    const { svg, stops } = build({ goals: [{ name: "Trip", months: 8 }, { name: "Camera", months: 8 }, { name: "Car", months: 30 }] });
    expect(svg).toContain(">Trip + 1 more</text>");
    expect(svg.match(/class="tl-goal"/g)).toHaveLength(2);
    expect(stops[1].goals).toEqual(["Trip", "Camera"]);
  });

  // edge case: long names are cut short, and labels that would overlap go on another row
  test("shortens long names and keeps close labels apart", () => {
    const { svg } = build({ goals: [{ name: "A very long goal name for a trip", months: 8 }, { name: "Car", months: 12 }] });
    expect(svg).toContain(">A very long goal na…</text>");
    const rows = [...svg.matchAll(/class="tl-goal-label" x="[\d.]+" y="([\d.]+)"/g)].map((m) => m[1]);
    expect(new Set(rows).size).toBe(2);
  });

  // wrong case: a goal name can't add markup to the chart
  test("escapes goal names", () => {
    const { svg } = build({ goals: [{ name: '<img src=x onerror="alert(1)">', months: 8 }] });
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img");
  });

  // edge case: no money at all still draws a chart with a $0 line
  test("draws a chart when every amount is $0", () => {
    const zero = { p10: 0, p50: 0, p90: 0 };
    const { svg, yTop } = build({ start: 0, points: [{ month: 6, ...zero, before: zero }] });
    expect(yTop).toBe(1000);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
});
