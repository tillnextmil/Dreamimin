# Dreamimin

A goals-based financial planner. Enter your financial picture and one
savings goal to see how much to save each month, whether you are on track,
your chance of reaching the goal if you invest, and whether the goal is
realistic.

## Run the app

1. Download or clone this repository.
2. Open `index.html` in a browser (double-click it).
3. Fill in your monthly income and spending, then your goal's name, amount
   and date. Results appear as you type.

The chance of reaching your goal is worked out by the PPO planner in a Web
Worker. Browsers block workers on pages opened straight from disk, so there
it runs on the page instead (same result, a little slower). To use the
worker, serve the folder and open http://localhost:8000:

```
python3 -m http.server
```

## Run the tests

Install [Node.js 22 LTS](https://nodejs.org/) (22.5 or newer; it
includes `npm`, and the SQL tests need its built-in `node:sqlite`). Then, in the repository folder:

```
npm install
npm test
```

`npm test` is the same command CI runs, so a local pass means a CI pass.

## Project layout

```
index.html, styles.css, app.js   the app (open index.html in a browser)
steps.js    moves between the app's three steps
src/        domain classes and the goal planner; unit tested
tests/      unit tests; every tests/*.test.js file runs automatically
mvp/        standalone goal-probability page; uses the classes in src/
docs/       ER diagram (draw.io)
prototype/  early prototype with the planning engine; brought in for M2
.github/    CI configuration
```

| Class | File | Does |
|---|---|---|
| FinancialProfile | `src/financialProfile.js` | Income, spending and net worth; monthly cash flow and savings rate |
| FinancialGoal | `src/financialGoal.js` | One goal; monthly saving required and whether you are on track |
| PpoPlanner | `src/ppoPlanner.js` | Works out the chance of reaching the goal, checked against a DP benchmark |
| GoalAnalysisResult | `src/goalAnalysisResult.js` | The planner's result: chance, benchmark, outcomes, portfolio each year |
| GoalProbability | `src/goalProbability.js` | A chance from 0 to 1, its verdict and its percent |
| InvestmentPortfolio | `src/investmentPortfolio.js` | The five portfolios, low to high risk: expected return and volatility |
| AvailableFunds | `src/availableFunds.js` | The funds available for the goal, lowered by recorded spending |
| Expense | `src/expense.js` | One recorded spending: amount, date and note |

## Diagrams

- ER diagram (final project): [docs/er-diagram.png](docs/er-diagram.png).
  To edit it, open [docs/er-diagram.drawio](docs/er-diagram.drawio) at
  [app.diagrams.net](https://app.diagrams.net) with File > Open from >
  Device, then export a new PNG over `docs/er-diagram.png`. The tables
  and the API that fills them are in SPECIFICATIONS.md, item 12.
- CRC diagram: [Figma](https://www.figma.com/design/UM2BklAjsoTZjnY2tivwa5/Financial-Planning-App-%E2%80%94-Domain-Model--UML-?node-id=0-1)

What the app does is in [REQUIREMENTS.md](REQUIREMENTS.md); exactly how it
behaves is in [SPECIFICATIONS.md](SPECIFICATIONS.md).

## Add a test

Export the class or function from its file in `src/` with
`module.exports` and `require` it from a file in `tests/`, as
`src/financialGoal.js` and `tests/goalMonths.test.js` show. Tests are
written in JavaScript with [Jest](https://jestjs.io/).
