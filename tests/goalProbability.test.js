// Unit tests for GoalProbability: verdicts, percent formatting and input checks.
// Author: Aiyan Tong

const GoalProbability = require("../src/goalProbability");

// normal case: a probability in each band gets that band's verdict and tone
test.each([
  [0.9, "Realistic", "ok"],
  [0.65, "Within reach", "mid"],
  [0.35, "A stretch", "short"],
  [0.1, "Not realistic yet", "short"],
])("%p is %p", (value, verdict, tone) => {
  const p = new GoalProbability(value);
  expect(p.verdict).toBe(verdict);
  expect(p.tone).toBe(tone);
});

// edge case: each threshold belongs to the higher verdict, and just below it to the lower one
test.each([
  [0.8, "Realistic"],
  [0.7999, "Within reach"],
  [0.5, "Within reach"],
  [0.4999, "A stretch"],
  [0.2, "A stretch"],
  [0.1999, "Not realistic yet"],
  [0, "Not realistic yet"],
  [1, "Realistic"],
])("%p is %p at the boundary", (value, verdict) => {
  expect(new GoalProbability(value).verdict).toBe(verdict);
});

// normal case: only a Realistic verdict counts as realistic
test("is realistic from 80% up", () => {
  expect(new GoalProbability(0.8).isRealistic).toBe(true);
  expect(new GoalProbability(0.7999).isRealistic).toBe(false);
});

// normal case: probabilities show as a whole percent
test.each([
  [0, "0%"],
  [0.5, "50%"],
  [0.734, "73%"],
  [1, "100%"],
])("%p shows as %p", (value, text) => {
  expect(new GoalProbability(value).toPercent()).toBe(text);
});

// edge case: a small chance never shows as 0%, and a near-certain one never as 100%
test.each([
  [0.004, "<1%"],
  [0.005, "1%"],
  [0.995, ">99%"],
  [0.994, "99%"],
])("%p shows as %p, not rounded to 0%% or 100%%", (value, text) => {
  expect(new GoalProbability(value).toPercent()).toBe(text);
});

// wrong case: a probability outside 0 to 1 is rejected
test.each([-0.01, 1.01, Infinity, -Infinity])("rejects %p", (value) => {
  expect(() => new GoalProbability(value)).toThrow(RangeError);
});

// wrong case: something that isn't a number is rejected
test.each([NaN, "0.5", null, undefined])("rejects the non-number %p", (value) => {
  expect(() => new GoalProbability(value)).toThrow(TypeError);
});

// edge case: a probability can't be changed after it is created
test("can't be changed after it is created", () => {
  const p = new GoalProbability(0.9);
  p.value = 0.1;   // ignored outside strict mode, throws inside it
  expect(Object.isFrozen(p)).toBe(true);
  expect(p.verdict).toBe("Realistic");
});
