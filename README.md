# Dreamimin

A goals-based financial planner. Enter your financial picture and one
savings goal to see how much to save each month, whether you are on track,
and your chance of reaching the goal if you invest.

## Run the app

No code, installs or setup needed:

1. Download or clone this repository.
2. Open `index.html` in a browser (double-click it).

The chance of reaching your goal is worked out by the PPO planner in a Web
Worker. Browsers block workers on pages opened straight from disk, so there
it runs on the page instead (same result, a little slower). To use the
worker, serve the folder and open http://localhost:8000:

```
python3 -m http.server
```

## Run the tests

Install [Node.js 22 LTS](https://nodejs.org/) (20 or newer works; it
includes `npm`). Then, in the repository folder:

```
npm install
npm test
```

`npm test` is the same command CI runs, so a local pass means a CI pass.

## Project layout

```
index.html, styles.css, app.js   the app (open index.html in a browser)
src/        domain classes (FinancialProfile, FinancialGoal) and the PPO
            goal planner (ppoPlanner.js, run by planner.worker.js); unit tested
tests/      unit tests; every tests/*.test.js file runs automatically
mvp/        standalone goal-probability page; uses the planner in src/
prototype/  early prototype with the planning engine; brought in for M2
.github/    CI configuration
```

## Add a test

Export the class or function from its file in `src/` with
`module.exports` and `require` it from a file in `tests/`, as
`src/financialGoal.js` and `tests/goalMonths.test.js` show. Tests are
written in JavaScript with [Jest](https://jestjs.io/).
