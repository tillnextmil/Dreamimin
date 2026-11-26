// Unit tests for RiskPreference: the highest risk level the plan may use, ESG investing,
// and rejecting invalid choices.
// Author: Autiana Wallace

const RiskPreference = require("../src/riskPreference");

// normal case: a chosen level and ESG are kept, and only the portfolios up to that level are allowed
test("keeps the level and ESG choice and allows portfolios up to the level", () => {
  const preference = new RiskPreference({ maxRiskLevel: 3, esg: true });
  expect(preference).toMatchObject({ maxRiskLevel: 3, esg: true });
  expect(preference.portfolios().map((p) => p.name)).toEqual(["ESG Cautious", "ESG Conservative", "ESG Balanced"]);
  expect(preference.describe()).toBe("Up to Balanced (level 3), ESG funds only");
});

// edge case: the defaults are level 5 and no ESG, which allows all five portfolios, as in the MVP
test("defaults to level 5 without ESG", () => {
  const preference = new RiskPreference();
  expect(preference).toMatchObject({ maxRiskLevel: 5, esg: false });
  expect(preference.portfolios().map((p) => p.riskLevel)).toEqual([1, 2, 3, 4, 5]);
  expect(preference.describe()).toBe("Up to Aggressive (level 5)");
});

// edge case: level 1 allows only the lowest-risk portfolio; ESG keeps the same numbers
test("level 1 allows one portfolio, and ESG keeps its return and volatility", () => {
  const plain = new RiskPreference({ maxRiskLevel: 1 }).portfolios();
  const esg = new RiskPreference({ maxRiskLevel: 1, esg: true }).portfolios();
  expect(plain).toEqual([{ riskLevel: 1, name: "Cautious", expectedReturn: 0.015, volatility: 0.05 }]);
  expect(esg).toEqual([{ ...plain[0], name: "ESG Cautious" }]);
});

// normal case: allows checks one risk level
test("allows only levels from 1 up to the chosen level", () => {
  const preference = new RiskPreference({ maxRiskLevel: 3 });
  expect([0, 1, 3, 4, 2.5].map((level) => preference.allows(level))).toEqual([false, true, true, false, false]);
});

// wrong case: a level that isn't a whole number from 1 to 5 is rejected
test.each([0, 6, 2.5, "3", null])("rejects the risk level %p", (maxRiskLevel) => {
  expect(RiskPreference.validate({ maxRiskLevel, esg: false })).toEqual({ maxRiskLevel: "Choose a risk level from 1 to 5." });
  expect(() => new RiskPreference({ maxRiskLevel })).toThrow(RangeError);
});

// wrong case: ESG must be true or false
test.each(["yes", 1, null])("rejects %p for ESG", (esg) => {
  expect(RiskPreference.validate({ maxRiskLevel: 3, esg })).toEqual({ esg: "Choose whether to invest in ESG funds." });
});

// edge case: a preference can't be changed after it is created
test("can't be changed after it is created", () => {
  const preference = new RiskPreference({ maxRiskLevel: 2 });
  preference.maxRiskLevel = 5;
  expect(preference.maxRiskLevel).toBe(2);
});

// normal case: with ESG on, the planner's portfolio names and the portfolio list read "ESG …"
test("names the portfolios for the page, with ESG names when ESG is on", () => {
  const plain = new RiskPreference({ maxRiskLevel: 3 });
  const esg = new RiskPreference({ maxRiskLevel: 3, esg: true });
  expect(plain.portfolioNames()).toEqual(["Cautious", "Conservative", "Balanced", "Growth", "Aggressive"]);
  expect(esg.portfolioNames(["A", "B", "C", "D", "E"])).toEqual(["ESG A", "ESG B", "ESG C", "ESG D", "ESG E"]);
  expect(esg.describePortfolios()[2]).toBe("ESG Balanced: expected to grow 3.7% a year, can rise or fall about 11.5% in a year");
  expect(plain.describePortfolios()).toHaveLength(5);
});