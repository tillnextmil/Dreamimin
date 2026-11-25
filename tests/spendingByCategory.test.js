// Unit tests for AvailableFunds.spendingByCategory: the recorded spending added up per category
// for the step 1 chart (SPECIFICATIONS.md, item 11).
// Author: Aiyan Tong

const AvailableFunds = require("../src/availableFunds");
const Expense = require("../src/expense");

const DAY = "2026-11-20";
const ASOF = new Date(2026, 10, 23);

function fundsWith(spending) {
  const funds = new AvailableFunds({ balance: 10000 });
  for (const [amount, category] of spending) funds.recordSpending(new Expense({ amount, date: DAY, category, asOf: ASOF }));
  return funds;
}

// normal case: one row per category with spending, largest first, with its share of the total
test("adds up the spending per category, largest first", () => {
  const funds = fundsWith([[30, "food"], [1200, "housing"], [45, "food"], [125, "transport"]]);
  expect(funds.spendingByCategory(Expense.CATEGORIES)).toEqual([
    { category: "housing", amount: 1200, share: 1200 / 1400 },
    { category: "transport", amount: 125, share: 125 / 1400 },
    { category: "food", amount: 75, share: 75 / 1400 },
  ]);
});

// normal case: the shares add up to the whole
test("gives shares that add up to 1", () => {
  const rows = fundsWith([[19.99, "fun"], [7.5, "food"], [100, "bills"], [3.33, "other"]]).spendingByCategory(Expense.CATEGORIES);
  expect(rows.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1, 12);
});

// edge case: amounts with cents don't pick up floating-point error
test("keeps each category's amount to the cent", () => {
  const rows = fundsWith([[0.1, "food"], [0.2, "food"]]).spendingByCategory(Expense.CATEGORIES);
  expect(rows).toEqual([{ category: "food", amount: 0.3, share: 1 }]);
});

// edge case: equal amounts follow the categories' own order, so the chart doesn't shuffle
test("keeps the categories' order for equal amounts", () => {
  const funds = fundsWith([[50, "shopping"], [50, "food"], [50, "housing"]]);
  expect(funds.spendingByCategory(Expense.CATEGORIES).map((r) => r.category)).toEqual(["housing", "food", "shopping"]);
});

// edge case: spending without a category counts as "other"; no order given still sorts by amount
test("counts spending without a category as other", () => {
  const funds = new AvailableFunds({ balance: 500 });
  funds.recordSpending(Object.freeze({ id: "a", amount: 20, date: DAY }));
  funds.recordSpending(new Expense({ amount: 40, date: DAY, category: "food", asOf: ASOF }));
  expect(funds.spendingByCategory().map((r) => [r.category, r.amount])).toEqual([["food", 40], ["other", 20]]);
});

// edge case: removed spending leaves its category, and no spending gives no rows
test("follows removed spending", () => {
  const funds = new AvailableFunds({ balance: 500 });
  const meal = new Expense({ amount: 40, date: DAY, category: "food", asOf: ASOF });
  funds.recordSpending(meal);
  expect(funds.spendingByCategory(Expense.CATEGORIES)).toHaveLength(1);
  funds.removeSpending(meal.id);
  expect(funds.spendingByCategory(Expense.CATEGORIES)).toEqual([]);
});
