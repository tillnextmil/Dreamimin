// Unit tests for InvestmentPortfolio: the five risk levels, their expected return and
// volatility, showing them as percents, and rejecting invalid portfolios.
// Author: Autiana Wallace

const InvestmentPortfolio = require("../src/investmentPortfolio");
const PpoPlanner = require("../src/ppoPlanner");

// normal case: there are five portfolios, lowest risk first, with the numbers from SPECIFICATIONS.md
test("has the five risk levels with their expected return and volatility", () => {
  const portfolios = InvestmentPortfolio.all();
  expect(portfolios.length).toBe(5);
  expect(portfolios.map((p) => p.name)).toEqual(["Cautious", "Conservative", "Balanced", "Growth", "Aggressive"]);
  expect(portfolios.map((p) => p.riskLevel)).toEqual([1, 2, 3, 4, 5]);
  expect(portfolios[0].expectedReturn).toBe(0.015);
  expect(portfolios[0].volatility).toBe(0.05);
  expect(portfolios[4].expectedReturn).toBe(0.057);
  expect(portfolios[4].volatility).toBe(0.19);
});

// normal case: a risk level gives back the matching portfolio
test("finds the portfolio for a risk level", () => {
  const balanced = InvestmentPortfolio.fromRiskLevel(3);
  expect(balanced.name).toBe("Balanced");
  expect(balanced.expectedReturn).toBe(0.037);
  expect(balanced.volatility).toBe(0.115);
});

// edge case: the lowest and highest risk levels both work
test("finds the lowest and highest risk levels", () => {
  expect(InvestmentPortfolio.fromRiskLevel(1).name).toBe("Cautious");
  expect(InvestmentPortfolio.fromRiskLevel(5).name).toBe("Aggressive");
});

// wrong case: risk levels outside 1 to 5, decimals and non-numbers are rejected
test.each([0, 6, -1, 2.5, "3", null, undefined])("rejects the risk level %p", (riskLevel) => {
  expect(() => InvestmentPortfolio.fromRiskLevel(riskLevel)).toThrow(RangeError);
});

// edge case: on the efficient frontier, more risk always means a higher expected return
// and a higher volatility, so no portfolio is worse than a safer one
test("expected return and volatility both go up with each risk level", () => {
  const portfolios = InvestmentPortfolio.all();
  for (let i = 1; i < portfolios.length; i++) {
    expect(portfolios[i].expectedReturn).toBeGreaterThan(portfolios[i - 1].expectedReturn);
    expect(portfolios[i].volatility).toBeGreaterThan(portfolios[i - 1].volatility);
  }
});

// normal case: the planner uses exactly the same five portfolios, so the page and the plan agree
test("matches the portfolios the PPO planner uses", () => {
  const portfolios = InvestmentPortfolio.all();
  expect(PpoPlanner.PORTFOLIOS.length).toBe(portfolios.length);
  portfolios.forEach((p, i) => {
    expect(PpoPlanner.PORTFOLIOS[i].name).toBe(p.name);
    expect(PpoPlanner.PORTFOLIOS[i].mu).toBe(p.expectedReturn);
    expect(PpoPlanner.PORTFOLIOS[i].sigma).toBe(p.volatility);
  });
});

// normal case: returns and volatility show as percents with one decimal place
test("shows expected return and volatility as percents", () => {
  const cautious = InvestmentPortfolio.fromRiskLevel(1);
  expect(cautious.expectedReturnPercent).toBe("1.5%");
  expect(cautious.volatilityPercent).toBe("5%");
  expect(InvestmentPortfolio.fromRiskLevel(4).volatilityPercent).toBe("15%");
});

// edge case: floating-point error doesn't show up in the percent (0.115 * 100 is 11.500000000000002)
test("shows decimal percents without floating-point error", () => {
  expect(InvestmentPortfolio.fromRiskLevel(3).volatilityPercent).toBe("11.5%");
  expect(InvestmentPortfolio.fromRiskLevel(3).expectedReturnPercent).toBe("3.7%");
  expect(InvestmentPortfolio.toPercent(0)).toBe("0%");
});

// normal case: the description says how much it is expected to grow and how much it can rise and fall
test("describes the portfolio in words", () => {
  expect(InvestmentPortfolio.fromRiskLevel(3).describe()).toBe(
    "Balanced: expected to grow 3.7% a year, can rise or fall about 11.5% in a year"
  );
});

// normal case: a typical year ends between expected return minus and plus one volatility
test("gives the typical range for an amount after one year", () => {
  const range = InvestmentPortfolio.fromRiskLevel(3).typicalYearRange(10000);
  expect(range.low).toBeCloseTo(9220);    // 10000 * (1 + 0.037 - 0.115)
  expect(range.high).toBeCloseTo(11520);  // 10000 * (1 + 0.037 + 0.115)
});

// edge case: a riskier portfolio has a wider range, and $0 stays $0
test("riskier portfolios have a wider range, and $0 stays $0", () => {
  const cautious = InvestmentPortfolio.fromRiskLevel(1).typicalYearRange(10000);
  const aggressive = InvestmentPortfolio.fromRiskLevel(5).typicalYearRange(10000);
  expect(aggressive.high - aggressive.low).toBeGreaterThan(cautious.high - cautious.low);
  expect(InvestmentPortfolio.fromRiskLevel(5).typicalYearRange(0)).toEqual({ low: 0, high: 0 });
});

// wrong case: a negative amount, or one typed with "$" and commas, is rejected
test("rejects a negative amount or one that isn't a number", () => {
  const balanced = InvestmentPortfolio.fromRiskLevel(3);
  expect(() => balanced.typicalYearRange(-500)).toThrow(RangeError);
  expect(() => balanced.typicalYearRange("$10,000")).toThrow(TypeError);
  expect(() => balanced.typicalYearRange(NaN)).toThrow(TypeError);
});

// wrong case: a portfolio with invalid values can't be created
test("rejects a portfolio with invalid values", () => {
  const valid = { riskLevel: 3, name: "Balanced", expectedReturn: 0.037, volatility: 0.115 };
  expect(InvestmentPortfolio.validate(valid)).toEqual({});
  expect(() => new InvestmentPortfolio({ ...valid, volatility: -0.1 })).toThrow("Volatility must be from 0% up to 100%.");
  expect(() => new InvestmentPortfolio({ ...valid, expectedReturn: "3.7%" })).toThrow("Expected return must be a number.");
  expect(() => new InvestmentPortfolio({ ...valid, expectedReturn: 1.5 })).toThrow("Expected return must be between -100% and 100%.");
  expect(() => new InvestmentPortfolio({ ...valid, name: "  " })).toThrow("Give the portfolio a name.");
  expect(() => new InvestmentPortfolio({ ...valid, riskLevel: 7 })).toThrow("Risk level must be a whole number from 1 to 5.");
});

// edge case: a portfolio can't be changed after it is created
test("can't be changed after it is created", () => {
  const balanced = InvestmentPortfolio.fromRiskLevel(3);
  balanced.expectedReturn = 0.5;   // ignored, because the portfolio is frozen
  expect(Object.isFrozen(balanced)).toBe(true);
  expect(balanced.expectedReturn).toBe(0.037);
});