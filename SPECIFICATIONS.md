# Specifications

1. Domain classes. The app uses these classes from our domain model.
   FinancialProfile (`src/financialProfile.js`) stores an id, a name,
   monthly income, monthly expenses and net worth, provides the monthly
   cash flow and savings rate, and can be changed with updateIncome,
   updateExpenses and updateNetWorth. FinancialGoal (`src/financialGoal.js`)
   stores an id, a name, a target amount and a target date, and works out
   the months remaining, the monthly saving required, whether a monthly
   amount is on track, and how many months a monthly amount takes; a goal
   can't be changed after it is created. GoalProbability
   (`src/goalProbability.js`) holds a probability from 0 to 1 and gives
   its verdict and its percent (see 8). GoalAnalysisResult
   (`src/goalAnalysisResult.js`) holds what the planner worked out for one
   goal: the probability and the DP benchmark (both GoalProbability), RL
   efficiency, the 10th, 50th and 90th percentile outcomes, and the
   portfolio for each year (see 9). PpoPlanner (`src/ppoPlanner.js`) is
   the planning algorithm that produces it (see 7). InvestmentPortfolio
   (`src/investmentPortfolio.js`) is one of the five investment options
   the plan chooses from, with its risk level, expected return and
   volatility (see 10). AvailableFunds (`src/availableFunds.js`) holds
   the money the user has available for the goal and the spending
   recorded against it, and Expense (`src/expense.js`) is one recorded
   spending (see 11).

2. Input validation. Monthly income and monthly spending are required;
   net worth is optional and is treated as 0 when empty. In money fields,
   spaces, commas and dollar signs are ignored, so "$4,500" is read as
   4500, and decimals are allowed; a field that still is not a number is
   rejected. Income and spending cannot be negative; net worth can be,
   since a person can owe more than they own. A goal needs a name of 1 to
   60 characters, an amount greater than $0, and a real calendar date
   after today. Both classes reject invalid values by throwing an error
   (a RangeError for a bad field, a TypeError when a monthly saving passed
   to FinancialGoal is not a number), and a FinancialProfile update with an invalid value leaves the profile
   unchanged. On the page, an error appears under its field once the user
   leaves that field.

3. Monthly cash flow and savings rate. Monthly cash flow is monthly income
   minus monthly spending, and is negative when spending is greater. The
   savings rate is the monthly cash flow divided by monthly income, for
   example 0.2 for 20%; when income is 0 it is 0, so there is no division
   by zero, and the page shows "–". The page shows cash flow in whole
   dollars with a "+" or "−" sign, the rate as a whole percent with a bar
   limited to between 0% and 100%, and, when cash flow is positive, the
   yearly amount (12 times the monthly cash flow).

4. Monthly saving required. The user saves once a month, starting today.
   The months remaining are the whole months from today to the target
   date: one fewer when the target date's day of the month is earlier
   than today's, since the last month is not complete, and never fewer
   than 1. For example, from January 15, a goal due April 15 has 3 months
   and a goal due April 14 has 2. The monthly saving required is the
   target amount divided by the months remaining.

5. On track. The goal is on track when the monthly cash flow is at least
   the monthly saving required; a cash flow of 0 or less is never on
   track. When on track, the page shows how many months the goal takes at
   the current cash flow (the target amount divided by the cash flow,
   rounded up, after rounding to 6 decimal places so floating-point error
   never adds a month: $17 at $17/7 a month takes 7 months) and the month it would be reached. When not on track and
   cash flow is positive, it shows the extra amount needed each month and
   when the goal would be reached at the current pace instead. The
   estimate assumes all monthly cash flow goes to the goal and leaves out
   existing savings and investment growth.

6. Updating results. Results are recalculated each time the user changes
   any field. The monthly money results are shown once income and
   spending are valid, and the goal check once the profile and the goal
   are both valid; otherwise each shows a message saying what to add. The
   Start over button in the top bar empties every field and removes the
   recorded spending and any error messages. When anything has been
   entered it first asks "Start over?" in a dialog: Clear everything goes
   ahead, while Keep my answers, Escape or a click outside the dialog
   leaves everything as it was. Inputs are not saved between visits. The page shows one of
   three steps at a time (Your money, Your goal, Your chances), chosen in
   the step bar or with Next and Back; the step is kept in the address
   (#money, #goal, #chances), so the browser's back button and links
   work. A step is marked done once its inputs are valid.

7. Chance with investing (M2). Once the profile and the goal are both
   valid, the page shows the probability of reaching the goal if the user
   invests, from the PPO planner (`src/ppoPlanner.js`). Wealth starts at
   the available funds when the user has entered them (see 11), otherwise
   at the net worth (0 when negative), and grows year by year with one of five
   portfolios (see 10), after-inflation returns, with the monthly cash
   flow added at the start of each year; a goal `n` months away is ceil(n / 12) years,
   with the yearly saving spread so the total saved is still n times the
   monthly cash flow. Goals more than 40 years away are not planned. The
   probability is how often the trained policy reaches the goal across
   4,000 fixed simulated markets. A dynamic-programming solution of the
   same problem is the benchmark, and RL efficiency is the planner's
   probability divided by the benchmark's, capped at 100%, and not shown
   when the benchmark is 0. Training always starts from the same seed and
   never from an earlier run, so the same inputs always give the same
   result. While training, the page shows a progress bar and the
   probability so far; the planner runs in a Web Worker, or on the page in
   short slices when the browser blocks workers (pages opened from disk).

8. Goal probability and verdict. A GoalProbability must be a number from
   0 to 1: anything else is rejected (a TypeError when it is not a number,
   a RangeError when it is out of range). Its verdict is Realistic at 80%
   or more, Within reach at 50% or more, A stretch at 20% or more, and
   otherwise Not realistic yet; each threshold belongs to the higher
   verdict, so exactly 80% is Realistic. Only Realistic counts as
   realistic. Each verdict has a tone that sets its colour on the page:
   "ok" for Realistic, "mid" for Within reach, and "short", a warning
   colour, for A stretch and Not realistic yet. The percent is rounded to a
   whole number, except that a chance above 0 that rounds to 0% shows as
   "<1%" and a chance below 1 that rounds to 100% shows as ">99%".

9. Analysis result. A GoalAnalysisResult is built from the planner's
   result and rejects one that doesn't make sense: RL efficiency must be
   from 0 to 1, or empty when there is no benchmark; the outcomes must be
   numbers in order (10th ≤ 50th ≤ 90th percentile); and there must be one
   portfolio per year, each one of the five. The page shows RL efficiency
   as a whole percent, or "–" when it is empty, and the outcomes as "About
   $X by <date> in a typical market; $Y in a bad one, $Z in a good one"
   (50th, 10th and 90th percentile). The portfolio for each year is shown
   as stages: "Balanced the whole way." when it never changes, otherwise
   for example "Growth until 2028, Balanced to 2029, then Conservative.",
   where each year is when that stage ends. The page also explains the
   verdict: how much the user will have put away before any growth
   compared with the goal, and, when the goal is not Realistic, the
   monthly saving needed without growth, or that the risk is a bad market
   just before the target date when saving alone would be enough. A
   result can't be changed after it is created.

10. Investment portfolios. There are five portfolios, from lowest to
    highest risk; each has a risk level from 1 to 5, a name, an expected
    yearly return and a volatility (how much it can rise or fall in a
    year), both after inflation:

    | Risk level | Name | Expected return | Volatility |
    |---|---|---|---|
    | 1 | Cautious | 1.5% | 5% |
    | 2 | Conservative | 2.5% | 8% |
    | 3 | Balanced | 3.7% | 11.5% |
    | 4 | Growth | 4.7% | 15% |
    | 5 | Aggressive | 5.7% | 19% |

    Both numbers go up with each risk level, and they are the same
    numbers the PPO planner uses. A portfolio is rejected when its risk
    level is not a whole number from 1 to 5, its name is empty, its
    expected return is not a number between -100% and 100%, or its
    volatility is not a number from 0% up to 100%; asking for a risk level
    that doesn't exist is also rejected. A portfolio can't be changed
    after it is created. Percents are rounded to one decimal place, so
    0.115 shows as "11.5%". The typical range for an amount after one
    year is the amount times (1 + expected return − volatility) up to the
    amount times (1 + expected return + volatility); the amount can't be
    negative. Under "How we got this number" the page lists the five
    portfolios in order, each as, for example, "Balanced: expected to grow
    3.7% a year, can rise or fall about 11.5% in a year". The portfolios
    can be stored in an `investment_portfolio` table (id, unique name,
    risk level 1 to 5, expected return, volatility of 0 or more).

11. Manage funds. The user can enter the funds they have available for
    the goal, update them, and record what they spend.

    AvailableFunds (`src/availableFunds.js`):

    | Member | Does |
    |---|---|
    | `new AvailableFunds({ id, balance })` | `balance` is a number of 0 or more; `id` is made up when left out |
    | `AvailableFunds.validate({ balance })` | Error message per invalid field; empty when valid |
    | `balance` | The funds left now, after recorded spending |
    | `expenses` | The recorded Expenses, oldest first; a copy that can't be changed |
    | `totalSpent` | The sum of the recorded Expenses' amounts |
    | `updateBalance(amount)` | Sets the funds to a new amount |
    | `recordSpending(expense)` | Takes an Expense, lowers the balance by its amount and keeps it; returns the new balance |
    | `removeSpending(expenseId)` | Removes a recorded Expense and adds its amount back; returns the new balance |

    Expense (`src/expense.js`):

    | Member | Does |
    |---|---|
    | `new Expense({ id, amount, date, note = "", asOf })` | `date` is "YYYY-MM-DD"; `asOf` is today, so tests can fix the date; `id` is made up when left out |
    | `Expense.validate({ amount, date, note, asOf })` | Error message per invalid field; empty when valid |
    | `id`, `amount`, `date`, `note` | The stored values; the note is trimmed |

    Rules. Invalid values are rejected by throwing, with these messages:

    | Case | Error | Message |
    |---|---|---|
    | Funds not a number | RangeError | "Available funds must be a number." |
    | Funds below 0 | RangeError | "Available funds can't be negative." |
    | `recordSpending` given something that isn't an Expense | TypeError | "Record an Expense." |
    | Spending more than the balance | RangeError | "That's more than your available funds." |
    | `removeSpending` with an unknown id | RangeError | "No spending with that id." |
    | Amount not a number | RangeError | "Spending amount must be a number." |
    | Amount of $0 or less | RangeError | "Spending amount must be more than $0." |
    | Date not a real calendar date | RangeError | "Choose a valid date." |
    | Date after today | RangeError | "The date can't be in the future." |
    | Note longer than 60 characters | RangeError | "Keep the note to 60 characters or fewer." |

    A failed update, recording or removal leaves the funds as they were.
    Exactly the balance can be spent, leaving $0. An Expense can't be
    changed after it is created, and today is a valid date.

    On the page, step 1 has an optional Available funds field and, below
    it, a form to record spending (amount, date, note) with a list of
    what has been recorded, each with a Remove button. Recording or
    removing spending updates the funds left and, through them, the
    chance of reaching the goal (see 7). When no available funds are
    entered, the chance is worked out from the net worth as before. The
    goal check (see 5) still uses only the monthly cash flow.

    Storage. The funds and spending can be stored in an `available_funds`
    table (funds id, balance of 0 or more) and an `expense` table (expense
    id, funds id referencing `available_funds`, amount above 0, date, note
    of 60 characters or fewer).

12. Server API. The final app saves its data on a small server: Node
    with Express, storing everything in SQLite through Node's built-in
    `node:sqlite`. `npm start` runs it and serves both the page and the
    API from the same address. This item is the contract between the
    page and the server: the page is built against these shapes (with
    mock data until a route exists), and each route is tested against
    them. Until sign-in exists there is one user, so there is one
    profile, one set of available funds and one risk preference, and
    no request names a user.

    Conventions:

    | Rule | Detail |
    |---|---|
    | Paths | Every route starts with `/api` |
    | Bodies | JSON in and out (`Content-Type: application/json`) |
    | Field names | camelCase in JSON, snake_case in SQL (`targetAmount` is `target_amount`) |
    | Money | A number of dollars, e.g. `4500.5` |
    | Dates | A `"YYYY-MM-DD"` string; times (`createdAt`) are ISO 8601 in UTC |
    | Ids | Whole numbers the database assigns; an id in a path that isn't a whole number is treated as unknown (404) |
    | Missing optional fields | Get their default; unknown fields are ignored |
    | 200 | Read or update worked; the body is the item or list |
    | 201 | Created; the body is the new item, with its id |
    | 204 | Deleted; no body |
    | 400 | Invalid input: `{ "errors": { "<field>": "<message>" } }`, one message per invalid field, the same messages as the domain classes' `validate`, so the page can show each under its field |
    | 404 | No item with that id: `{ "error": "<message>" }` |
    | 409 | Valid input that doesn't fit what's saved, such as spending more than the funds: `{ "error": "<message>" }` |

    A request that fails changes nothing.

    Routes:

    | Method | Path | Does | Success |
    |---|---|---|---|
    | GET | `/api/profile` | The profile | 200 Profile |
    | PUT | `/api/profile` | Saves income, spending and net worth | 200 Profile |
    | GET | `/api/risk-preference` | The risk preference | 200 RiskPreference |
    | PUT | `/api/risk-preference` | Saves it | 200 RiskPreference |
    | GET | `/api/goals` | Every goal; `sort` and `search` are optional | 200 Goal[] |
    | GET | `/api/goals/:id` | One goal | 200 Goal |
    | POST | `/api/goals` | Creates a goal | 201 Goal |
    | PUT | `/api/goals/:id` | Edits a goal (every field is sent) | 200 Goal |
    | DELETE | `/api/goals/:id` | Deletes a goal and its saved results | 204 |
    | GET | `/api/funds` | Funds left now, with totals | 200 Funds |
    | PUT | `/api/funds` | Sets the funds left now | 200 Funds |
    | GET | `/api/expenses` | Recorded spending; `category`, `from`, `to` and `search` are optional | 200 Expense[] |
    | POST | `/api/expenses` | Records spending; lowers the funds | 201 Expense |
    | PUT | `/api/expenses/:id` | Edits spending; the funds change by the difference | 200 Expense |
    | DELETE | `/api/expenses/:id` | Removes spending; adds its amount back | 204 |
    | GET | `/api/funds-events` | Recorded income and losses; `kind` is optional | 200 FundsEvent[] |
    | POST | `/api/funds-events` | Records income (raises the funds) or a loss (lowers them) | 201 FundsEvent |
    | PUT | `/api/funds-events/:id` | Edits one; the funds change by the difference | 200 FundsEvent |
    | DELETE | `/api/funds-events/:id` | Removes one and undoes its change to the funds | 204 |
    | GET | `/api/portfolios` | The five portfolios, lowest risk first (see 10) | 200 Portfolio[] |
    | POST | `/api/plans` | Saves a plan the planner worked out | 201 Plan |
    | GET | `/api/plans/latest` | The plan saved most recently | 200 Plan |

    Profile: `{ "id": 1, "name": "My profile", "income": 5000,
    "expenses": 3200, "netWorth": 12000 }`. `PUT` takes `income`,
    `expenses` and `netWorth` (optional, default 0) and checks them with
    `FinancialProfile.validate` (see 2). Before the first `PUT`,
    `income` and `expenses` are `null` and `netWorth` is 0.

    RiskPreference: `{ "maxRiskLevel": 3 }`. The plan only uses
    portfolios with a risk level up to `maxRiskLevel`, a whole number
    from 1 to 5 ("Choose a risk level from 1 to 5."); it starts at 5, so
    every portfolio can be used, as in the MVP. To preview a level before
    choosing it, the page runs the planner with that level and only
    sends the `PUT` once the user confirms.

    Goal: `{ "id": 3, "name": "Car", "targetAmount": 12000,
    "targetDate": "2028-06-01", "priority": 4, "minAcceptableAmount":
    8000, "createdAt": "2026-11-09T22:15:00.000Z" }`.

    | Field | Rule | Message |
    |---|---|---|
    | `name`, `targetAmount`, `targetDate` | As FinancialGoal (see 2); the date must be after today whenever the goal is saved | FinancialGoal's messages |
    | `priority` | Whole number from 1 (least important) to 5 (most); default 3 | "Choose a priority from 1 to 5." |
    | `minAcceptableAmount` | The smallest amount the user would accept if the full amount can't be reached; 0 or more and less than `targetAmount`; default 0, meaning only the full amount counts | "The smallest amount you'd accept must be $0 or more and less than the goal amount." |

    There can be at most 20 goals, the most the planner takes; creating
    a 21st is a 409 ("You can have up to 20 goals."). A goal's timeline
    is extended by a `PUT` with a later `targetDate`, which keeps its id,
    so nothing linked to it is lost. `GET /api/goals` lists soonest
    target date first; `sort` can be `date`, `priority` (most important
    first, then soonest), `amount` (largest first) or `name` (A to Z),
    and anything else is a 400 ("Sort by date, priority, amount or
    name."). `search` keeps the goals whose name contains it, ignoring
    case. An unknown id is a 404 ("No goal with that id.").

    Funds: `{ "balance": 1534.5, "totalSpent": 465.5, "totalIncome":
    800, "totalLoss": 0 }`. `balance` is the funds left now, as in
    AvailableFunds (see 11), and is `null` until the first `PUT`; the
    totals add up the recorded spending, income and losses. `PUT` takes
    `balance` and checks it with `AvailableFunds.validate`. Spending,
    income and losses can only be recorded once the funds have been set
    (409, "Enter your available funds first."), and no request can leave
    the funds below $0: recording or editing spending or a loss that is
    more than the funds is a 409 ("That's more than your available
    funds."), and so is removing or lowering income that has already
    been spent ("That would leave your available funds below $0.").

    Expense: `{ "id": 7, "amount": 45.5, "date": "2026-10-12", "note":
    "Gas", "category": "transport" }`. `amount`, `date` and `note` follow
    `Expense.validate` (see 11). `category` is one of `housing`, `food`,
    `transport`, `bills`, `health`, `fun`, `shopping` or `other`
    (default `other`; anything else is "Choose a category from the
    list."). The list is oldest first, as AvailableFunds keeps it;
    `category` keeps one category, `from` and `to` keep the dates between
    them (both included), and `search` keeps the spending whose note
    contains it, ignoring case. An unknown id is a 404 ("No spending
    with that id.").

    FundsEvent: `{ "id": 2, "kind": "income", "amount": 800, "date":
    "2026-11-01", "note": "Bonus" }`. Money that comes in or goes out
    outside everyday spending: `kind` is `income` (a raise, a bonus, a
    gift) or `loss` (an emergency, a market drop); anything else is
    "Choose income or loss.". `amount`, `date` and `note` follow the same
    rules and messages as an Expense. `kind` in `GET` keeps one kind. An
    unknown id is a 404 ("No income or loss with that id.").

    Portfolio: `{ "id": 3, "riskLevel": 3, "name": "Balanced",
    "expectedReturn": 0.037, "volatility": 0.115 }`, read only.

    Plan: the planner runs on the page (in a Web Worker, see 7), and the
    page saves each finished plan so it can be shown again without
    retraining. `POST` takes:

    ```json
    {
      "maxRiskLevel": 3,
      "utility": 6.1,
      "dpUtility": 6.5,
      "rlEfficiency": 0.94,
      "riskLevelByYear": [3, 3, 2, 1],
      "goals": [
        { "goalId": 3, "pFull": 0.62, "pPartial": 0.21 },
        { "goalId": 5, "pFull": 0.9, "pPartial": 0 }
      ]
    }
    ```

    `utility` and `dpUtility` are the planner's and the DP benchmark's
    expected utility (0 or more); `rlEfficiency` is from 0 to 1, or
    `null` when there is no benchmark (see 7); `riskLevelByYear` has the
    risk level (1 to 5, no higher than `maxRiskLevel`) of the portfolio
    for each year, 1 to 40 years; `goals` has one entry per saved goal,
    where `pFull` is the chance of reaching the full amount and
    `pPartial` the chance of only reaching `minAcceptableAmount`, both
    from 0 to 1 and together no more than 1. An invalid field is a 400
    naming it; a `goalId` that doesn't exist is a 404 ("No goal with
    that id."). The response adds `id`, `createdAt`, and for each goal
    `pAny` (`pFull + pPartial`) and the `verdict` GoalProbability gives
    `pAny` (see 8). `GET /api/plans/latest` returns the same shape, or a
    404 ("No plan has been saved yet.") before the first. A saved plan
    is a record of what was worked out: editing a goal afterwards
    doesn't change it, and deleting a goal deletes that goal's results.

    Storage. Each item is a row in the SQLite database, in the tables of
    our ER diagram (`docs/er-diagram.drawio`): `profile`,
    `risk_preference`, `goal`, `available_funds`, `expense`,
    `funds_event`, `investment_portfolio`, `plan_result`, `goal_result`
    (one row per goal per plan, with `p_full`, `p_partial` and
    `verdict`) and `plan_year` (one row per year and portfolio of a
    plan, with `allocation_percent`, the share of the money in that
    portfolio; the planner uses one portfolio a year, so it is 1). Every table checks the same limits as
    the API, so a bad value can't be saved even by a bug in a route.
