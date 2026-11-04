// Integration test for Manage Funds: AvailableFunds, Expense and PpoPlanner together.
// Recording spending lowers the starting wealth and doesn't raise the chance of reaching the goal.
// Author: Autiana Wallace

const AvailableFunds = require("../src/availableFunds");
const Expense = require("../src/expense");
const PpoPlanner = require("../src/ppoPlanner");

// A $30,000 car 31 months away, saving $700 a month. Few PPO rounds and paths keep the test quick.
// The page passes the funds left (funds.balance) to the planner as its starting wealth.
const TODAY = new Date(2099, 0, 15);
const QUICK = { iterations: 10, evalPaths: 500 };
const chanceFrom = (funds) =>
  PpoPlanner.plan({ netWorth: funds.balance, monthlySaving: 700, cost: 30000, months: 31 }, QUICK);

test("recording spending lowers the starting wealth and doesn't raise the chance", () => {
  const funds = new AvailableFunds({ balance: 10000 });
  const before = chanceFrom(funds);

  const trip = new Expense({ amount: 4000, date: "2099-01-10", note: "Trip", asOf: TODAY });
  funds.recordSpending(trip);
  const after = chanceFrom(funds);

  expect(funds.balance).toBe(6000);
  expect(after.prob).toBeLessThanOrEqual(before.prob);
  expect(after.dp).toBeLessThanOrEqual(before.dp);

  // removing the spending brings back the starting wealth, and the same inputs give the same chance
  funds.removeSpending(trip.id);
  expect(funds.balance).toBe(10000);
  expect(chanceFrom(funds).prob).toBe(before.prob);
});