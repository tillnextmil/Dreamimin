# Cognifi Prototype

The early prototype of the full planner. Enter your money and your goals, and it shows your odds of reaching each one.

**Team:** Autiana Wallace · Jessica Chang · Aiyan Tong · Amy Zheng
**Course:** CSCI 187 · Software Engineering

---

## Overview

The prototype answers one question: *Am I on track for the things I care about?*

1. You enter your financial picture: net worth, income, expenses, and savings.
2. You list your goals, each with a cost, a due date, and an importance score.
3. The planner simulates 4,000 possible markets.
4. It returns the chance of reaching each goal and says whether the goal is realistic.

> **Where this fits:** The main Dreamimin app lives one folder up. This folder holds the planning engine brought in for M2. The one-goal PPO MVP lives in `../mvp/`, not here.

---

## Project Summary

The prototype is one page with seven sections.

1. **The Picture** – Enter net worth, income, expenses, savings, and age.
2. **The Goals** – Add, edit, or remove goals. Set a smaller "would accept" amount.
3. **Beliefs** – Set risk tolerance, turn on ESG-only funds, and rank goals.
4. **The Plan** – See what to fund, how to invest, and your odds. Test "what if" changes.
5. **The Odds** – Compare every goal's odds across all five risk levels.
6. **Retirement** – Get a tax-efficient withdrawal order across traditional, Roth, and taxable accounts. Add an annuity if you want one.
7. **The Ledger** – View pie charts and a month-by-month calendar.

### How the planner works

- A dynamic program works backward from the last goal.
- For every year and balance, it picks which goals to pay and which risk level to hold.
- A Monte Carlo run plays that plan through simulated markets.
- Wealth follows `W(t+1) = W(t) · exp[(μ − σ²/2) + σZ]`.
- The method follows Das, Ostrov, Radhakrishnan, and Srivastav, *Dynamic Optimization for Multi-Goals Wealth Management*.

### Tech stack

- Plain HTML, CSS, and JavaScript. No framework and no build step.
- Five engine classes in `src/`. Each one loads in the browser and also exports for Node.js.
- `localStorage` to keep your data in your own browser.

---

## Setup

### Requirements

- A modern browser (Chrome, Edge, Firefox, or Safari).
- An internet connection for the Google Fonts. The page still works without it.
- Python 3, only if you want a local server.

### Option 1: Open the file

1. Open the `prototype` folder.
2. Double-click `index.html`.

### Option 2: Run a local server

1. Open a terminal.
2. Go to the `dreaming` folder, one level above `prototype`.

   ```bash
   cd dreaming
   ```

3. Start a local server.

   ```bash
   python -m http.server 5188
   ```

4. Open the prototype in your browser: <http://localhost:5188/prototype/>

> **Note:** Serve from `dreaming`, not from `prototype`. The page loads its logo from `../logo.png`.

---

## How to Use

1. Fill in **The Picture**. Pick yearly, monthly, or bi-weekly amounts.
2. Go to **The Goals** and click **Add a goal**.
3. Enter a name, cost, due date, and importance (1–10).
4. Add a smaller "would accept" amount if a partial goal still works for you.
5. Go to **Beliefs** and set your risk limit.
6. Move goals up or down in **What matters most** to change their weight.
7. Open **The Plan** to see your odds and what to fund.
8. Drag the **set aside a little more** slider to test extra savings.
9. Use **Money in, money out** to test a bonus or a withdrawal.
10. Click **Confirm** to keep a change, or **Discard** to drop it.
11. Turn on **Count retirement as one of my goals** under **Retirement**.
12. Click **Download my plan (CSV)** to save your results.

> **Tip:** Click **Go back to the example** in the footer to load sample data.

---

## Project Structure

```text
prototype/
├── index.html               Page layout (seven sections)
├── styles.css               Styles, light and dark themes
├── app.js                   Interface: state, rendering, inputs, routing
├── engine.js                Builds the one Engine object app.js talks to
└── src/
    ├── market.js            Market: risk levels and simulated markets
    ├── goalSolver.js        GoalSolver: multi-goal dynamic program
    ├── goalPlanner.js       GoalPlanner: Monte Carlo and best risk level
    ├── taxCalculator.js     TaxCalculator: 2026 federal brackets and IRS tables
    └── retirementPlanner.js RetirementPlanner: yearly retirement withdrawals
```

`index.html` loads the scripts in this order: the five `src/` files, then `engine.js`, then `app.js`.

### Key methods

| Class | Method | What it does |
|-------|--------|--------------|
| `Market` | `portfolio()` | Returns the return and swing for a risk level, with or without ESG. |
| `Market` | `growth()` | Builds seeded yearly growth factors, so results hold still between edits. |
| `GoalSolver` | `solve()` | Runs the dynamic program backward from the last goal. |
| `GoalPlanner` | `simulate()` | Plays the plan through 4,000 simulated markets. |
| `GoalPlanner` | `optimize()` | Finds the best risk level inside your tolerance. |
| `GoalPlanner` | `standalone()` | Gets one goal's odds when pursued alone. |
| `TaxCalculator` | `totalTax()` | Taxes ordinary income and capital gains together. |
| `RetirementPlanner` | `plan()` | Tries every withdrawal strategy and keeps the best one. |

---

## Testing the Engine

Each `src/` class ends with `module.exports`, so Jest can load it. No tests cover these classes yet.

1. Create a test file in `../tests/`, such as `../tests/market.test.js`.
2. Require the class from the prototype folder.

   ```js
   const Market = require("../prototype/src/market");

   test("five risk levels", () => {
     expect(Market.RISK).toHaveLength(5);
   });
   ```

3. Run the tests from the `dreaming` folder.

   ```bash
   npm test
   ```

---

## Research Sources

The math follows the Ostrov papers on goals-based wealth management:

- *Dynamic Optimization for Multi-Goals Wealth Management* – the dynamic program
- *Efficient Goal Probabilities* – importance scores and risk-level comparison
- *Dynamic Portfolio Allocation in Goals-Based Wealth Management* – cash in and cash out
- *Constructing Tax-Efficient Withdrawal Strategies* – retirement withdrawal order
- *Optimal Strategies for Traditional vs Roth IRA/401(k) Consumption* – which account to draw first
- *Lifestyle, Longevity, Legacy Risks with Annuities* – annuity and income vs. legacy

---

## Disclaimer

Cognifi is a class project. All amounts use today's dollars and after-inflation returns. It is not financial advice.
