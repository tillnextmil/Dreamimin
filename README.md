# Dreamimin

A goals-based financial planner. Enter your financial picture and your
savings goals to see how much each goal needs every month, whether you are
on track, your chance of reaching a goal if you invest, and whether it is
realistic.

## Run the app

Install [Node.js 22 LTS](https://nodejs.org/) (22.13 or newer; it
includes `npm` and the built-in `node:sqlite` database the server uses).
Then, in the repository folder:

```
npm install
npm start
```

and open http://localhost:3000. Fill in your monthly income and spending,
then add your goals (name, amount, date and priority). Choose a goal in
the list to check it and to see your chance of reaching it.

`npm start` serves the page and the API (routes under `/api`, described
in SPECIFICATIONS.md, item 12) and keeps the data in `data/dreamimin.db`,
which is not committed. Set `PORT` or `DB_FILE` to change either, for
example `PORT=4000 npm start`. Stop it with Ctrl+C.

The chance of reaching your goal is worked out by the PPO planner in a Web
Worker. The page also works opened straight from disk (double-click
`index.html`), but browsers block workers there, so the planner runs on the
page instead (same result, a little slower).

## Run the tests

With Node.js installed as above, in the repository folder:

```
npm install
npm test
```

`npm test` is the same command CI runs, so a local pass means a CI pass.

## Project layout

```
index.html, styles.css   the page's markup and styles (served by npm start)
client/     the page's code: views, controllers and the API client
server/     the Express server: API routes, services, repositories, SQLite schema
src/        domain classes and the goal planner, used by the page and the server; unit tested
tests/      unit and API tests; every tests/*.test.js file runs automatically
data/       the database npm start creates (not committed)
mvp/        standalone goal-probability page; uses the classes in src/
docs/       ER diagram (draw.io)
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
| Views | `client/views/` | What's on screen for each step; no rules and no server calls |
| Controllers | `client/controllers/` | User input in; calls the domain classes and the API client, then tells the views what to show |
| API client | `client/api/goalApi.js` | The only code that talks to the server. `MemoryGoalApi` follows the same contract in memory until the server saves goals |
| Domain | `src/` | The same classes the server uses |

`client/app.js` starts the page and keeps the steps in step. The
`SERVER_SAVES_GOALS` switch at its top chooses between the real API and
the in-memory one.


| Class | File | Does |
|---|---|---|
| FinancialProfile | `src/financialProfile.js` | Income, spending and net worth; monthly cash flow and savings rate |
| FinancialGoal | `src/financialGoal.js` | One goal with its priority and smallest acceptable amount; monthly saving required and whether you are on track |
| GoalList | `src/goalList.js` | The rules for the list of goals: at most 20, sorting and searching |
| PpoPlanner | `src/ppoPlanner.js` | Works out the chance of reaching the goal, checked against a DP benchmark |
| GoalAnalysisResult | `src/goalAnalysisResult.js` | The planner's result: chance, benchmark, outcomes, portfolio each year |
| GoalProbability | `src/goalProbability.js` | A chance from 0 to 1, its verdict and its percent |
| InvestmentPortfolio | `src/investmentPortfolio.js` | The five portfolios, low to high risk: expected return and volatility |
| AvailableFunds | `src/availableFunds.js` | The funds available for the goal, lowered by recorded spending |
| Expense | `src/expense.js` | One recorded spending: amount, date, note and category |

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
