// Unit tests for RetirementPlan: checking the ages and amounts, and the chance the
// money lasts when a yearly amount is withdrawn from the retirement age on.
// Author: Jessica Chang

const RetirementPlan = require("../src/retirementPlan");
const GoalProbability = require("../src/goalProbability");

const QUICK = { paths: 500 };   // fewer market paths, to keep the tests quick

// retired today at 65 with $1,000,000, withdrawing $40,000 a year until 95
const retiree = (changes = {}) => new RetirementPlan({
  currentAge: 65, retirementAge: 65, lastsToAge: 95, netWorth: 1000000, yearlyWithdrawal: 40000, ...changes,
});

// still working: 25 now, saving $500 a month until 65, then $30,000 a year until 95
const saver = (changes = {}) => new RetirementPlan({
  currentAge: 25, retirementAge: 65, lastsToAge: 95, netWorth: 10000, monthlySaving: 500, yearlyWithdrawal: 30000, ...changes,
});

describe("checking the fields", () => {
  // normal case: a valid plan keeps its fields and works out its years
  test("keeps the fields of a valid plan", () => {
    const plan = saver();
    expect(plan.yearsToRetirement).toBe(40);
    expect(plan.yearsInRetirement).toBe(30);
    expect(plan.totalWithdrawals).toBe(900000);
    expect(plan.riskLevel).toBe(3);   // Balanced unless the user chooses
  });

  // normal case: nothing to report for valid fields
  test("validate gives no errors for a valid plan", () => {
    expect(RetirementPlan.validate(saver().toJSON())).toEqual({});
  });

  // edge case: retiring this year is allowed, with no saving years left
  test("allows a retirement age equal to the current age", () => {
    expect(retiree().yearsToRetirement).toBe(0);
  });

  // edge case: the youngest and oldest ages allowed
  test("accepts ages at the limits", () => {
    const plan = retiree({ currentAge: 18, retirementAge: 18, lastsToAge: 120 });
    expect(plan.yearsInRetirement).toBe(102);
  });

  // error case: ages outside the limits, or not whole numbers
  test.each([17, 121, 65.5, "65", NaN, undefined])("rejects a current age of %p", (currentAge) => {
    expect(() => retiree({ currentAge })).toThrow("Age must be a whole number from 18 to 120.");
  });

  // error case: can't retire in the past
  test("rejects a retirement age before the current age", () => {
    expect(() => saver({ retirementAge: 24 })).toThrow("Retirement age can't be before the current age.");
  });

  // error case: the money has to last at least one year past retirement
  test.each([65, 60])("rejects a last age of %p when retiring at 65", (lastsToAge) => {
    expect(() => retiree({ lastsToAge })).toThrow("The money must last to an age after the retirement age.");
  });

  // error case: the withdrawal has to be a positive amount
  test.each([0, -100, NaN, "40000"])("rejects a yearly withdrawal of %p", (yearlyWithdrawal) => {
    expect(() => retiree({ yearlyWithdrawal })).toThrow(RangeError);
  });

  // error case: saving can't be negative, and net worth must be a number
  test("rejects negative saving and a missing net worth", () => {
    expect(() => saver({ monthlySaving: -1 })).toThrow("Monthly saving can't be negative.");
    expect(() => saver({ netWorth: undefined })).toThrow("Net worth must be a number.");
  });

  // error case: only the five risk levels exist
  test.each([0, 6, 2.5])("rejects a risk level of %p", (riskLevel) => {
    expect(() => retiree({ riskLevel })).toThrow("Choose a risk level from 1 to 5.");
  });

  // error case: validate reports every invalid field at once, for the form
  test("validate names each invalid field", () => {
    const errors = RetirementPlan.validate({ currentAge: 10, retirementAge: 200, lastsToAge: 0, netWorth: "x", yearlyWithdrawal: 0, riskLevel: 9 });
    expect(Object.keys(errors).sort()).toEqual(["currentAge", "lastsToAge", "netWorth", "retirementAge", "riskLevel", "yearlyWithdrawal"]);
  });

  // a plan can't be changed after it is checked
  test("is frozen", () => {
    const plan = retiree();
    expect(() => { "use strict"; plan.yearlyWithdrawal = 1; }).toThrow(TypeError);
  });
});

describe("the chance the money lasts", () => {
  // normal case: the result is a GoalProbability with its verdict
  test("gives a probability and a verdict", () => {
    const result = retiree().simulate(QUICK);
    expect(result.probability).toBeInstanceOf(GoalProbability);
    expect(result.verdict).toBe(result.probability.verdict);
    expect(result.probability.value).toBeGreaterThan(0.5);
    expect(result.probability.value).toBeLessThan(0.95);
  });

  // normal case: the same inputs always give the same result
  test("gives the same result every time", () => {
    expect(retiree().simulate(QUICK)).toEqual(retiree().simulate(QUICK));
  });

  // edge case: far more money than the withdrawals need
  test("is certain when the withdrawals are tiny next to the money", () => {
    const result = retiree({ yearlyWithdrawal: 100 }).simulate(QUICK);
    expect(result.probability.value).toBe(1);
    expect(result.unluckyRunsOutAge).toBeNull();
    expect(result.medianBalanceAtEnd).toBeGreaterThan(0);
  });

  // edge case: no money and no saving, so the first withdrawal can't be paid
  test("is zero with nothing saved, and runs out at the retirement age", () => {
    const result = saver({ netWorth: 0, monthlySaving: 0 }).simulate(QUICK);
    expect(result.probability.value).toBe(0);
    expect(result.unluckyRunsOutAge).toBe(65);
    expect(result.medianBalanceAtEnd).toBe(0);
  });

  // edge case: a debt counts as starting from $0, like the planners
  test("treats a negative net worth as $0", () => {
    expect(saver({ netWorth: -50000 }).simulate(QUICK)).toEqual(saver({ netWorth: 0 }).simulate(QUICK));
  });

  // edge case: already retired, so the balance at retirement is today's net worth
  test("has today's net worth at retirement when retiring now", () => {
    expect(retiree().simulate(QUICK).balanceAtRetirement).toEqual({ p10: 1000000, p50: 1000000, p90: 1000000 });
  });

  // edge case: one withdrawal only needs the money to be there on the day
  test("pays a single withdrawal the money covers", () => {
    const result = retiree({ lastsToAge: 66, netWorth: 40000 }).simulate(QUICK);
    expect(result.probability.value).toBe(1);
  });

  // normal case: saving years spread the balance at retirement out
  test("orders the balance at retirement from unlucky to lucky", () => {
    const { p10, p50, p90 } = saver().simulate(QUICK).balanceAtRetirement;
    expect(p10).toBeLessThan(p50);
    expect(p50).toBeLessThan(p90);
  });

  // asking for more never improves the chance
  test("a bigger withdrawal never has a better chance", () => {
    const chances = [20000, 40000, 60000, 80000].map((w) => retiree({ yearlyWithdrawal: w }).simulate(QUICK).probability.value);
    for (let i = 1; i < chances.length; i++) expect(chances[i]).toBeLessThanOrEqual(chances[i - 1]);
    expect(chances[3]).toBeLessThan(chances[0]);
  });

  test("lasting to a later age never has a better chance", () => {
    const chances = [75, 85, 95, 105].map((age) => retiree({ lastsToAge: age }).simulate(QUICK).probability.value);
    for (let i = 1; i < chances.length; i++) expect(chances[i]).toBeLessThanOrEqual(chances[i - 1]);
    expect(chances[3]).toBeLessThan(chances[0]);
  });

  test("saving more never has a worse chance", () => {
    const chances = [0, 500, 1500].map((m) => saver({ monthlySaving: m }).simulate(QUICK).probability.value);
    for (let i = 1; i < chances.length; i++) expect(chances[i]).toBeGreaterThanOrEqual(chances[i - 1]);
    expect(chances[2]).toBeGreaterThan(chances[0]);
  });

  // the unlucky age is inside the retirement years when the money can run out
  test("gives an unlucky age between the retirement age and the last age", () => {
    const age = retiree({ yearlyWithdrawal: 80000 }).simulate(QUICK).unluckyRunsOutAge;
    expect(age).toBeGreaterThanOrEqual(65);
    expect(age).toBeLessThan(95);
  });

  // error case: the number of paths must make sense
  test.each([0, -5, 2.5])("rejects %p paths", (paths) => {
    expect(() => retiree().simulate({ paths })).toThrow("Paths must be a whole number, at least 1.");
  });
});

describe("comparing risk levels", () => {
  // normal case: one row per portfolio, lowest risk first
  test("gives the chance at all five risk levels", () => {
    const rows = retiree().compareRiskLevels(QUICK);
    expect(rows.map((r) => r.riskLevel)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.map((r) => r.name)).toEqual(["Cautious", "Conservative", "Balanced", "Growth", "Aggressive"]);
    expect(rows[2].probability.value).toBe(retiree().simulate(QUICK).probability.value);
  });

  // normal case: withRiskLevel changes only the risk level
  test("withRiskLevel keeps the other fields", () => {
    const plan = retiree().withRiskLevel(5);
    expect(plan.toJSON()).toEqual({ ...retiree().toJSON(), riskLevel: 5 });
  });
});

describe("the withdrawal the money can sustain", () => {
  // normal case: the answer is the last dollar that still meets the target
  test("finds the largest withdrawal that meets the target chance", () => {
    const plan = retiree();
    const amount = plan.sustainableWithdrawal(0.8, QUICK);
    const chance = (w) => retiree({ yearlyWithdrawal: w }).simulate(QUICK).probability.value;
    expect(chance(amount)).toBeGreaterThanOrEqual(0.8);
    expect(chance(amount + 1)).toBeLessThan(0.8);
  });

  // normal case: a safer target means a smaller withdrawal
  test("asks for less when the target chance is higher", () => {
    const plan = retiree();
    expect(plan.sustainableWithdrawal(0.95, QUICK)).toBeLessThan(plan.sustainableWithdrawal(0.5, QUICK));
  });

  // edge case: nothing can be withdrawn from nothing
  test("is $0 when there is no money", () => {
    expect(retiree({ netWorth: 0 }).sustainableWithdrawal(0.8, QUICK)).toBe(0);
  });

  // error case: the target has to be a chance
  test.each([0, 1.5, -0.2, "0.8"])("rejects a target chance of %p", (target) => {
    expect(() => retiree().sustainableWithdrawal(target, QUICK)).toThrow("The target chance must be more than 0 and at most 1.");
  });
});

// normal case: toJSON gives back the fields a new plan can be built from
test("toJSON round-trips through the constructor", () => {
  const plan = saver({ riskLevel: 4 });
  expect(new RetirementPlan(plan.toJSON()).toJSON()).toEqual(plan.toJSON());
});
