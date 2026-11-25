# Dreamimin

A goals-based financial planner. Enter your financial picture and your
savings goals to see how much each goal needs every month, whether you are
on track, your chance of reaching a goal if you invest, and whether it is
realistic.

## Run the app

```bash
npm install
npm start
```

1. Install [Node.js 22 LTS](https://nodejs.org/), version 22.13 or newer.
   It comes with `npm` and the `node:sqlite` database the server uses.
2. Run the two commands above in the repository folder.
3. Open <http://localhost:3000>.
4. Enter your monthly income and spending in step 1, add your goals in
   step 2, and choose a goal to see your chance of reaching it in step 3.

Stop the server with `Ctrl+C`.

### Change the port or the database file

```bash
PORT=4000 DB_FILE=/tmp/dreamimin.db npm start
```

| Variable | Default | Sets |
|---|---|---|
| `PORT` | `3000` | The port the page and the API are served on |
| `DB_FILE` | `data/dreamimin.db` | The SQLite file the server saves to (not committed) |

The API routes are under `/api` and are listed in
[SPECIFICATIONS.md](SPECIFICATIONS.md), item 12.

## Run the tests

```bash
npm install
npm test
```

CI runs the same `npm test` on every push and pull request, so a local
pass means a CI pass.

## Project layout

```
index.html, styles.css   the page's markup and styles (served by npm start)
client/     the page's code: views, controllers and the API client
server/     the Express server: API routes, services, repositories, SQLite schema
src/        domain classes and the goal planner, used by the page and the server; unit tested
tests/      unit and API tests; every tests/*.test.js file runs automatically
data/       the database npm start creates (not committed)
mvp/        standalone goal-probability page; uses the classes in src/
docs/       the project documents (see docs/README.md): proposal and interviews, diagrams, usability test
prototype/  early prototype with the planning engine; brought in for M2
.github/    CI configuration
```

The server is split into layers. Each layer only calls the one below it,
so each can be tested on its own:

| Layer | Where | Does |
|---|---|---|
| Routes | `server/routes/` | HTTP in and out: reads the request, sends JSON and the status code |
| Services | `server/services/` | What the app does: rules, validation with the domain classes, sorting and searching |
| Repositories | `server/repositories/` | The SQL for one table each; turns rows into plain objects |
| Domain | `src/` | The classes the page uses too, such as FinancialGoal and AvailableFunds |
| Database | `server/db.js`, `server/schema.sql` | Opens SQLite and creates the tables of the ER diagram |

`server/app.js` connects the layers and `server/index.js` starts the
server. To add a route, follow `/api/goals`: a repository, a service, a
router, one line in `server/app.js`, and a test like
`tests/goalsApi.test.js`.

The page is split the same way (views and controllers in separate files):

| Layer | Where | Does |
|---|---|---|
| Views | `client/views/` | What's on screen for each step; no rules and no server calls. `timelineChart.js` turns the plan's timeline into the step 3 chart |
| Controllers | `client/controllers/` | User input in; calls the domain classes and the API client, then tells the views what to show |
| API client | `client/api/goalApi.js` | The only code that talks to the server. `MemoryGoalApi` follows the same contract in memory when the page is opened straight from disk |
| Domain | `src/` | The same classes the server uses |

`client/app.js` starts the page and keeps the steps in step. The
`SERVER_SAVES_GOALS` switch at its top chooses between the real API and
the in-memory one.


| Class | File | Does |
|---|---|---|
| FinancialProfile | `src/financialProfile.js` | Income, spending and net worth; monthly cash flow and savings rate |
| FinancialGoal | `src/financialGoal.js` | One goal with its priority and smallest acceptable amount; monthly saving required and whether you are on track |
| GoalList | `src/goalList.js` | The rules for the list of goals: at most 20, sorting and searching, and which goals the planner can plan |
| PpoPlanner | `src/ppoPlanner.js` | Works out the chance of reaching one goal, checked against a DP benchmark (used by the `mvp/` page) |
| GoalAnalysisResult | `src/goalAnalysisResult.js` | PpoPlanner's result: chance, benchmark, outcomes, portfolio each year |
| MultiGoalPlanner | `src/multiGoalPlanner.js` | Plans every goal together: which to fund in full, in part or skip, and how to invest, checked against a DP benchmark; compares the five risk levels and what-if changes |
| MultiGoalPlan | `src/multiGoalPlan.js` | That plan's result: each goal's chance and verdict, utility against the benchmark, risk level each year as stages; step 3 shows it |
| GoalProbability | `src/goalProbability.js` | A chance from 0 to 1, its verdict and its percent |
| InvestmentPortfolio | `src/investmentPortfolio.js` | The five portfolios, low to high risk: expected return and volatility |
| RetirementPlan | `src/retirementPlan.js` | Yearly withdrawals from the retirement age on, and the chance the money lasts to a chosen age |
| AvailableFunds | `src/availableFunds.js` | The funds available for the goal, lowered by recorded spending; adds the spending up by category for the step 1 chart (drawn by `client/views/pieChart.js`) |
| Expense | `src/expense.js` | One recorded spending: amount, date, note and category |

## Diagrams

- ER diagram (final project): [docs/er-diagram.png](docs/er-diagram.png).
  To edit it, open [docs/er-diagram.drawio](docs/er-diagram.drawio) at
  [app.diagrams.net](https://app.diagrams.net) with File > Open from >
  Device, then export a new PNG over `docs/er-diagram.png`. The tables
  and the API that fills them are in SPECIFICATIONS.md, item 12.
- CRC diagram (final project): [docs/crc-diagram.png](docs/crc-diagram.png).
  To edit it, open [docs/crc-diagram.drawio](docs/crc-diagram.drawio)
  the same way and export a new PNG over `docs/crc-diagram.png`. Its cards are grouped by MVC layer: views,
  controllers (browser controllers and API routes), model (services,
  repositories, domain classes and the planners) and the database. Cards
  with a dashed border are planned and name their owner. The MVP's
  diagram is on
  [Figma](https://www.figma.com/design/UM2BklAjsoTZjnY2tivwa5/Financial-Planning-App-%E2%80%94-Domain-Model--UML-?node-id=0-1).

Every document the project hands in is listed in
[docs/README.md](docs/README.md). What the app does is in
[REQUIREMENTS.md](REQUIREMENTS.md); exactly how it
behaves is in [SPECIFICATIONS.md](SPECIFICATIONS.md).

## Add a test

Export the class or function from its file in `src/` with
`module.exports` and `require` it from a file in `tests/`, as
`src/financialGoal.js` and `tests/goalMonths.test.js` show. Tests are
written in JavaScript with [Jest](https://jestjs.io/).
