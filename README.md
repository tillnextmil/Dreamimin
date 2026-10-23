# Dreamimin

A goals-based financial planner. Enter your financial picture and one
savings goal to see how much to save each month and whether your current
surplus is enough to reach it by the target date.

Written in JavaScript: the app runs in the browser (HTML/CSS/JS), and
tests run on Node.js with [Jest](https://jestjs.io/).

## One-time setup

1. Install [Node.js 22 LTS](https://nodejs.org/) (20 or newer works). This
   also installs `npm`.
2. Clone this repository and open it in VS Code.
3. In the repository folder, install the dependencies:

```
npm install
```

## Running the tests locally

This is the same command CI runs, so if it passes locally it will pass in
CI too:

```
npm test
```

## Project layout

```
index.html, styles.css, app.js   the M1 app (open index.html in a browser)
src/        domain classes (FinancialProfile, FinancialGoal); unit tested
tests/      unit tests; every tests/*.test.js file runs automatically
prototype/  early prototype with the planning engine; brought in for M2
.github/    CI configuration
```

To make a function testable, export it from its file in `src/` with
`module.exports = { ... }` and `require` it from the test, as
`src/prime.js` and `tests/prime.test.js` show.

## Running the app

Open `index.html` in a browser.
