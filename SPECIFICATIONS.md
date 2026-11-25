# Specifications

1. Domain classes. The app uses these classes from our domain model.
   FinancialProfile (`src/financialProfile.js`) stores an id, a name,
   monthly income, monthly expenses, net worth and the emergency fund the
   user keeps, provides the monthly cash flow, the savings rate and the
   money for goals (see 5), and can be changed with updateIncome,
   updateExpenses, updateNetWorth and updateEmergencyFund. FinancialGoal (`src/financialGoal.js`)
   stores an id, a name, a target amount, a target date, a priority and
   the smallest amount the user would accept, and works out
   the months remaining, the monthly saving required, whether a monthly
   amount is on track, and how many months a monthly amount takes; a goal
   can't be changed after it is created. GoalList (`src/goalList.js`)
   holds the rules for the list of goals: at most 20, and how the list is
   sorted and searched (see 12 and 13). GoalProbability
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
   since a person can owe more than they own. The emergency fund to keep
   is optional, $0 when empty, and must be a number of $0 or more
   ("Emergency fund must be a number." / "Emergency fund can't be
   negative."). Under each of the three optional fields, a line says what
   it means: net worth is everything the user owns minus everything they
   owe, and the goals start from it when Available funds is empty;
   available funds are the cash the user could put toward goals today,
   leaving out money for bills or emergencies, and recorded spending comes
   out of them; the emergency fund is money the user won't touch for
   goals (3 to 6 months of spending is a common rule of thumb), and the
   goals start from what's left after it. With an emergency fund, step
   1's results also show it and the money left for goals. A goal needs a name of 1 to
   60 characters, an amount greater than $0, and a real calendar date
   after today. Its priority is a whole number from 1 (least important)
   to 5 (most), 3 when left out ("Choose a priority from 1 to 5."), and
   the smallest amount the user would accept is $0 or more and less than
   the goal amount, $0 when left out, meaning only the full amount counts
   ("The smallest amount you'd accept must be $0 or more and less than
   the goal amount."; checked against the goal amount only when that is
   valid). Both classes reject invalid values by throwing an error
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
   and a goal due April 14 has 2. The monthly saving required is what is
   still needed after the money the user has now (see 5) divided by the
   months remaining, and $0 when that money already covers the target:
   $1,200 due in 3 months with $600 saved needs $200 a month.

5. On track. The money for goals is the same starting money the chance
   in 7 uses: the available funds left when they are entered, otherwise
   the net worth, minus the emergency fund, and 0 when that is negative
   (FinancialProfile.moneyForGoals): $15,000 of funds with a $6,000
   emergency fund leaves $9,000 for goals, so being able to afford a goal
   never means spending the emergency fund on it. The goal is on
   track when that money plus the monthly cash flow for the months
   remaining adds up to the target amount, so step 2 and step 3 never
   disagree because one of them ignores savings. With no savings, a cash
   flow of 0 or less is never on track; when the savings already cover
   the target, a cash flow of 0 is on track, and a negative one is on
   track only while what it takes out by the target date still leaves
   the target amount ($1,300 saved for $1,200 in 3 months stays on track
   at -$30 a month but not at -$50). When on track, the page shows how
   many months the goal takes (what is still needed divided by the cash
   flow, rounded up, after rounding to 6 decimal places so
   floating-point error never adds a month: $17 at $17/7 a month takes 7
   months) and the month it would be reached, or says the savings
   already cover it. When not on track and cash flow is positive, it
   shows the extra amount needed each month and when the goal would be
   reached at the current pace instead. The estimate assumes the savings
   and all monthly cash flow go to this goal and leaves out investment
   growth, which the chance in 7 adds. FinancialGoal works these numbers
   out (`check`); the goal view only shows them.

6. Updating results. Results are recalculated each time the user changes
   a field on step 1 or a goal is added, edited, deleted or chosen. The
   monthly money results are shown once income and spending are valid,
   and the goal check once the profile and the chosen goal are both
   valid; otherwise each shows a message saying what to add. The
   Start over button in the top bar empties every field, deletes every
   goal and removes the recorded spending and any error messages. When
   anything has been entered or a goal exists, it first asks "Start
   over?" in a dialog: Clear everything goes ahead, while Keep my
   answers, Escape or a click outside the dialog leaves everything as it
   was. Step 1's inputs are not saved between visits yet. The page shows
   one of three steps at a time (Your money, Your goals, Your chances),
   chosen in the step bar or with Next and Back; the step is kept in the
   address (#money, #goal, #chances), so the browser's back button and
   links work. A step is marked done once its inputs are valid (for Your
   goals, once there is a chosen goal that can be checked); the step bar
   shows the monthly cash flow under Your money, the number of goals
   under Your goals and, once the chances are worked out (see 16), the
   one goal's chance or how many goals are realistic ("2 of 3
   realistic") under Your chances.

7. Chance with investing (M2). The PPO planner (`src/ppoPlanner.js`)
   works out the probability of reaching one goal if the user invests.
   The page now plans every goal together with MultiGoalPlanner (see 14
   and 16), which uses this model; the standalone page in `mvp/` still
   uses PpoPlanner. Wealth starts at
   the money for goals (see 5): the available funds when the user has
   entered them (see 11), otherwise the net worth, minus the emergency
   fund (0 when negative), and grows year by year with one of five
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
   result. The planners run in a Web Worker, or on the page in short
   slices when the browser blocks workers (pages opened from disk).

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
   portfolio per year, each one of the five. The `mvp/` page shows RL efficiency
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
    | `setEnteredAmount(entered)` | Sets the funds from the amount the user entered: entered + income − losses − spending; returns the new balance |
    | `recordSpending(expense)` | Takes an Expense, lowers the balance by its amount and keeps it; returns the new balance |
    | `removeSpending(expenseId)` | Removes a recorded Expense and adds its amount back; returns the new balance |
    | `editSpending(expenseId, edited)` | Swaps a recorded Expense for its edited version (same id); the balance changes by the difference; returns the new balance |
    | `events`, `totalIncome`, `totalLoss` | The recorded income and losses (oldest first, a copy that can't be changed), and their totals |
    | `recordEvent(event)` | Records a FundsEvent: income raises the balance, a loss lowers it; returns the new balance |
    | `removeEvent(eventId)` | Removes recorded income or a loss and undoes its change; returns the new balance |
    | `editEvent(eventId, edited)` | Swaps recorded income or a loss for its edited version (same id); the balance changes by the difference |
    | `spendingByCategory(order)` | The recorded spending added up per category, largest first: `{ category, amount, share }` for each category with spending, where `amount` is rounded to the cent and `share` is that amount over `totalSpent`; equal amounts follow `order` (the page passes `Expense.CATEGORIES`); an Expense without a category counts as `other` |

    Expense (`src/expense.js`):

    | Member | Does |
    |---|---|
    | `new Expense({ id, amount, date, note = "", category = "other", asOf })` | `date` is "YYYY-MM-DD"; `category` is one of `Expense.CATEGORIES` (`housing`, `food`, `transport`, `bills`, `health`, `fun`, `shopping`, `other`); `asOf` is today, so tests can fix the date; `id` is made up when left out |
    | `Expense.validate({ amount, date, note, category, asOf })` | Error message per invalid field; empty when valid |
    | `id`, `amount`, `date`, `note`, `category` | The stored values; the note is trimmed |

    FundsEvent (`src/fundsEvent.js`): income (such as a bonus) or a loss (such as a car repair) outside everyday spending:

    | Member | Does |
    |---|---|
    | `new FundsEvent({ id, kind, amount, date, note = "", asOf })` | `kind` is `income` or `loss` ("Choose income or loss."); `amount`, `date` and `note` follow the same rules and messages as an Expense; `id` is made up when left out |
    | `FundsEvent.validate({ kind, amount, date, note, asOf })` | Error message per invalid field; empty when valid |
    | `change` | `+amount` for income, `-amount` for a loss |

    Rules. Invalid values are rejected by throwing, with these messages:

    | Case | Error | Message |
    |---|---|---|
    | Funds not a number | RangeError | "Available funds must be a number." |
    | Funds below 0 | RangeError | "Available funds can't be negative." |
    | `recordSpending` given something that isn't an Expense | TypeError | "Record an Expense." |
    | Spending more than the balance | RangeError | "That's more than your available funds." |
    | `removeSpending` with an unknown id | RangeError | "No spending with that id." |
    | `editSpending` that would leave the funds below $0 | RangeError | "That's more than your available funds." |
    | `editSpending` with an edit that has a different id | RangeError | "The edited spending must keep its id." |
    | `recordEvent` given something that isn't income or a loss | TypeError | "Record income or a loss." |
    | A loss, or an edit to one, more than the balance | RangeError | "That's more than your available funds." |
    | Removing or lowering income that has already been spent | RangeError | "That would leave your available funds below $0." |
    | `removeEvent` or `editEvent` with an unknown id | RangeError | "No income or loss with that id." |
    | `editEvent` with an edit that has a different id | RangeError | "The edited income or loss must keep its id." |
    | `setEnteredAmount` with less than the spending recorded | RangeError | "That's less than the spending you've recorded." |
    | Amount not a number | RangeError | "Spending amount must be a number." |
    | Amount of $0 or less | RangeError | "Spending amount must be more than $0." |
    | Date not a real calendar date | RangeError | "Choose a valid date." |
    | Date after today | RangeError | "The date can't be in the future." |
    | Note longer than 60 characters | RangeError | "Keep the note to 60 characters or fewer." |
    | Category not on the list | RangeError | "Choose a category from the list." |

    A failed update, recording or removal leaves the funds as they were.
    Exactly the balance can be spent, leaving $0. An Expense can't be
    changed after it is created, and today is a valid date.

    On the page, step 1 has an optional Available funds field and, below
    it, a form to record spending (amount, date, category, note; the
    category is Other unless chosen, and stays as chosen for the next
    one) with a list of what has been recorded, each with its category
    and a Remove button. Remove asks "Remove this spending?" in a dialog
    first, naming the amount, date, category and note ("$86.00, November
    18, 2026 · Food · Dinner out."): Remove spending goes ahead and puts
    the amount back in the funds, while Keep it, Escape or a click
    outside the dialog leaves it. After a removal, keyboard focus moves
    to the Remove button now in its place (the last one when it was at
    the end), or to the Amount field when none are left. Once spending is in two categories or more, a
    chart above the list shows how it splits (`client/views/pieChart.js`):
    a ring with a slice per category, largest first, clockwise from 12
    o'clock, the total spent in the middle, and a legend with each
    category's colour, name, amount and share ("Food $298.40 41%"; a
    share that rounds to 0% or 100% shows as "<1%" or ">99%"). Each
    category keeps its own colour (Housing blue, Food orange, Transport
    aqua, Bills yellow, Health pink, Fun green, Shopping violet, Other
    gray), checked so neighbouring colours stay apart for colour-blind
    readers; the legend names every slice, so no category is told apart
    by colour alone. Pointing at a slice or a legend row brings out that
    category in both. With spending in one category the chart is hidden,
    since the list already says it all. Recording or
    removing spending updates the funds left and, through them, the
    chance of reaching the goal (see 7). When no available funds are
    entered, the chance is worked out from the net worth as before. The
    goal check (see 5) starts from the same money, so recording spending
    updates it too.

    Storage. The funds and spending are stored in an `available_funds`
    table (funds id, the profile they belong to, the entered amount and
    the balance, both 0 or more) and an `expense` table (expense id, funds
    id referencing `available_funds`, amount above 0, date, note of 60
    characters or fewer, and a category from the list, `other` by default), and a `funds_event` table (event id, funds id, kind `income` or `loss`, amount above 0, date, note of 60 characters or fewer).

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
    | PUT | `/api/profile` | Saves income, spending, net worth and emergency fund | 200 Profile |
    | GET | `/api/risk-preference` | The risk preference | 200 RiskPreference |
    | PUT | `/api/risk-preference` | Saves it | 200 RiskPreference |
    | GET | `/api/goals` | Every goal; `sort` and `search` are optional | 200 Goal[] |
    | GET | `/api/goals/:id` | One goal | 200 Goal |
    | POST | `/api/goals` | Creates a goal | 201 Goal |
    | PUT | `/api/goals/:id` | Edits a goal (every field is sent) | 200 Goal |
    | DELETE | `/api/goals/:id` | Deletes a goal and its saved results | 204 |
    | GET | `/api/funds` | Funds left now, with totals | 200 Funds |
    | PUT | `/api/funds` | Sets the funds from the amount the user entered | 200 Funds |
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
    "expenses": 3200, "netWorth": 12000, "emergencyFund": 6000 }`. `PUT`
    takes `income`, `expenses`, `netWorth` and `emergencyFund` (both
    optional, default 0) and checks them with `FinancialProfile.validate`
    (see 2). Before the first `PUT`, `income` and `expenses` are `null`
    and `netWorth` and `emergencyFund` are 0.

    RiskPreference: `{ "maxRiskLevel": 3, "esg": false }` (see 17). `esg`
    is optional in a `PUT` and keeps its saved value. The plan only uses
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

    Funds: `{ "entered": 1200, "balance": 1534.5, "totalSpent": 465.5,
    "totalIncome": 800, "totalLoss": 0 }`. `entered` is what the user
    typed in the Available funds field, before any recorded spending,
    income or losses, so the page can show it again. `balance` is the
    funds left now, as in AvailableFunds (see 11): the entered amount
    plus the recorded income, minus the recorded losses and spending.
    Both are `null` until the first `PUT`; the totals add up the recorded
    spending, income and losses. `PUT` takes `entered`, checks it with
    `AvailableFunds.validate`, and works out the new balance with
    `AvailableFunds.setEnteredAmount`, the same rule the page uses.
    Entering less than that leaves the funds below $0, so it is a 409
    ("That's less than the spending you've recorded.") and nothing
    changes. Spending,
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
    from 0 to 1 and together no more than 1. The rules and messages are
    MultiGoalPlan's (`MultiGoalPlan.validate`, see 14), so an invalid
    field is a 400 naming it with the same message the page would get,
    for example `{ "errors": { "goals": "A goal's full and partial
    chances can't add up to more than 1." } }`, one message per field;
    a body that isn't a JSON object gets a message for every field. A
    `goalId` that isn't one of the user's goals (or isn't a whole
    number) is a 404 ("No goal with that id."), checked after the
    fields. The response adds `id`, `createdAt`, and for each goal
    `pAny` (`pFull + pPartial`) and the `verdict` GoalProbability gives
    `pAny` (see 8); its goals come soonest target date first, as the
    page lists them. The plan, its goal results and its years are saved
    in one transaction, so a request that fails saves none of them;
    each year's row points at the portfolio with that year's risk level.
    `GET /api/plans/latest` returns the same shape, or a 404 ("No plan
    has been saved yet.") before the first. A saved plan is a record of
    what was worked out: editing a goal afterwards doesn't change it,
    and deleting a goal deletes that goal's results.

    Layers: `server/routes/planRoutes.js`, `server/services/planService.js`
    and `server/repositories/planRepository.js`, which reads a saved plan
    back in this shape (`findById`). `POST` is built; `GET
    /api/plans/latest` is next.

    Storage. Each item is a row in the SQLite database, in the tables of
    our ER diagram (`docs/er-diagram.drawio`): `profile`,
    `risk_preference`, `goal`, `available_funds`, `expense`,
    `funds_event`, `investment_portfolio`, `plan_result`, `goal_result`
    (one row per goal per plan, with `p_full`, `p_partial` and
    `verdict`) and `plan_year` (one row per year and portfolio of a
    plan, with `allocation_percent`, the share of the money in that
    portfolio; the planner uses one portfolio a year, so it is 1). Every table checks the same limits as
    the API, so a bad value can't be saved even by a bug in a route.

13. Multiple goals (page). Step 2, Your goals, lists every goal and has
    a form under the list for adding one. A goal is added with a name,
    an amount, a date, a priority (3 unless chosen) and, optionally, the
    smallest amount the user would accept; Add goal (or Enter in a field)
    saves it if every field is valid (see 2), and otherwise shows each
    field's error and puts the cursor on the first one. Each goal in the
    list shows its name, amount and date, its priority, the smallest
    amount when there is one, the saving it needs each month, and, once
    income and spending are valid, whether it is on track (see 5). A goal
    whose date has passed says "Date has passed" and can be edited to a
    later date. Edit puts the goal in the form ("Edit <name>", Save
    changes and Cancel); saving keeps its id, so extending a goal's date
    loses nothing. Delete asks "Delete <name>?" in a dialog first: Delete
    goal goes ahead, while Keep it, Escape or a click outside leaves the
    goal. The list can be searched by name (ignoring case) and sorted by
    soonest date (the default), most important, largest amount or name;
    the order and the 20-goal limit are GoalList's rules, the same ones
    the API follows (see 12). The count shows as "3 of 20", and with 20
    goals Add goal is turned off and says why. Choosing a goal in the list
    (the newest one after adding, the first one otherwise) shows its goal
    check next to the list; step 3 shows the chance of every goal (see
    16).
    The page talks to the server only through the goal API client
   (`client/api/goalApi.js`). The server saves the goals in SQLite, so
    they are still there after a reload. When the page is opened
    straight from disk, the client keeps the goals in memory with the
    same rules and messages, so they are gone after a reload.
                          
14. Planning every goal together. MultiGoalPlanner
    (`src/multiGoalPlanner.js`) plans all the goals from one pot of
    money, and MultiGoalPlan (`src/multiGoalPlan.js`) holds the result.
    (Item 13 is the goals page.)

    The job. The planner takes the starting wealth (as in 7; 0 when
    negative), the monthly cash flow, the highest risk level the plan
    may use (1 to 5, 5 when left out) and 1 to 20 goals, each with an id,
    its target amount, the months until its target date, its priority
    (3 when left out) and the smallest amount the user would accept (0
    when left out). It rejects, with a RangeError, anything else: no
    goals or more than 20, a goal without an id or two with the same id,
    an amount of $0 or less, months that are not a whole number of at
    least 1, a goal more than 40 years away, a priority outside 1 to 5, a
    smallest amount below $0 or not less than the goal amount, and a
    risk level outside 1 to 5.

    The model. Time moves from one goal date to the next, with a stop at
    least every 12 months, so a goal 8 months away is decided after 8
    months, not after a year. At each stop the plan picks one of the
    portfolios up to the risk level (see 10) and adds the monthly cash
    flow for the months until the next stop; wealth then grows as in 7,
    with the return and the volatility scaled to the length of the step.
    When a goal comes due the plan does one of three things: takes it in
    full (pays the target amount), takes it in part (pays the smallest
    acceptable amount, only when the goal has one) or skips it. What is
    paid leaves the pot, so an early goal can cost a later one. Goals due
    the same month are decided most important first. With one goal a
    whole number of years away, this is the model in 7.

    Utility. A goal taken in full is worth its priority (1 to 5), and a
    goal taken in part is worth its priority times the smallest amount
    divided by the target amount: a priority 4 goal of $25,000 taken at
    $15,000 is worth 2.4. A plan's utility is the average total over the
    simulated markets, so it is at most the sum of the priorities.

    PPO and the benchmark. A PPO policy is trained to get the most
    utility; it sees how far through the plan it is, its wealth against
    the largest goal and, at a goal, the goal's priority, the share its
    smallest amount is of the full one and the wealth against its cost.
    A dynamic-programming solution of the same problem is the benchmark.
    Both are scored on the same 4,000 fixed markets as in 7. RL
    efficiency is the plan's utility divided by the benchmark's, capped
    at 100%, and empty when the benchmark's utility is 0. Training
    always starts from the same seed, so the same inputs give the same
    plan in the same browser.

    The result of `plan(job)`:

    | Field | Is |
    |---|---|
    | `maxRiskLevel` | The risk level the plan was held to |
    | `utility`, `dpUtility` | The plan's and the benchmark's utility |
    | `rlEfficiency` | From 0 to 1, or `null` when there is no benchmark |
    | `riskLevelByYear` | The risk level held at the start of each year, along the path where every year has the expected return |
    | `goals` | Per goal, in the job's order: `goalId`, `pFull` (reached in full), `pPartial` (reached only in part) and `pAny`, their sum |
    | `benchmarkGoals` | The same for the DP benchmark |
    | `timeline` | Per stop: `month`, the wealth left after that stop's goals in a bad, typical and good market (`p10`, `p50`, `p90`), and `before`, the same three just before those goals are paid (equal to them at a stop with no goal) |
    | `years`, `portfolios` | The length of the plan in years, and the five portfolio names |

    The first five fields, with each goal's `goalId`, `pFull` and
    `pPartial`, are the body of `POST /api/plans` (see 12).
    `planSteps(job)` gives the same result a step at a time, as in 7: one
    `benchmark` message with the benchmark's utility and goal chances,
    which arrives in well under a second and can be shown while the plan
    trains, then one `progress` message per PPO round.

    MultiGoalPlan is built from that result and rejects one that doesn't
    make sense: a risk level outside 1 to 5, a negative utility, an RL
    efficiency outside 0 to 1 (empty is allowed), fewer than 1 or more
    than 40 years, a year above the plan's risk level, no goals, two
    goals with the same id, or a goal whose two chances are not
    probabilities or add up to more than 1, or portfolio names that are
    not five names. `MultiGoalPlan.validate(result)` applies the same
    rules and gives one message per invalid field (`maxRiskLevel`,
    `utility`, `dpUtility`, `rlEfficiency`, `riskLevelByYear`, `goals`,
    `portfolios`), empty when the result is valid; the constructor
    throws the first one. When the risk level itself is invalid, the
    years are checked against level 5, so one mistake gives one message.
    Each goal has its chance in
    full, in part and of either, as GoalProbability (see 8), and its
    verdict comes from the chance of either: 62% in full and 21% in part
    is 83%, Realistic. With the five portfolio names (the planner's
    result has them) the risk level each year reads as stages, as in 9:
    "Balanced until 2028, Conservative to 2029, then Cautious.", where
    each year is when that stage ends; without them each stage is "Risk
    level n". `toJSON()` gives the body of `POST /api/plans`. A plan
    can't be changed after it is created.

    Quick answers. The benchmark needs no training, so three functions
    answer from it straight away, each in well under a second for a
    typical plan:

    | Function | Gives |
    |---|---|
    | `estimate(job)` | The benchmark's plan: `maxRiskLevel`, `utility`, `goals` and `riskLevelByYear`. The same numbers `plan` reports as `dpUtility` and `benchmarkGoals` |
    | `compareRiskLevels(job)` | The estimate at each of the five risk levels, lowest first, each with the name of its riskiest `portfolio`, on the same markets |
    | `whatIf(job, changes)` | The estimate `before` and `after` replacing the job's fields with `changes` (for example `{ monthlySaving: 1200 }`), the `utilityChange`, and per goal its chance `before`, `after` and the `change`; a goal that is only in one of the two has an empty `after` or `before` and an empty `change` |

    Time. Training takes about as long as the single-goal planner: the
    number of PPO rounds is 2,400 divided by the number of decisions
    plus one, kept between 100 and 260, and each round plays 960 divided
    by the number of decisions trajectories, kept between 24 and 64, so
    a plan with many goals over many years stays within about twice the
    time of a short one.

    Worker. `src/planner.worker.js` runs both planners off the page.
    `{ job }` trains a plan (MultiGoalPlanner when the job has a list of
    goals, otherwise PpoPlanner) and posts each message, then `{ type:
    "result", ... }`. `{ task: "compare", job }` posts `{ type:
    "comparison", levels }` and `{ task: "whatIf", job, changes }` posts
    `{ type: "whatIf", ... }`.
                           
15. Retirement withdrawals. The user gives their current age, a
    retirement age, a yearly withdrawal and the age the money should last
    to. Until the retirement age they keep saving their monthly saving
    (12 times it each year). From the retirement age on, the yearly
    withdrawal is taken out at the start of each year, up to but not
    including the last age, so retiring at 65 with money lasting to 95
    is 30 withdrawals. The app shows the probability that every
    withdrawal is paid. Tax and the order accounts are drawn from are
    left out, and all amounts are in today's dollars.

    Model. It is the planners' wealth model (item 7) with one portfolio
    (item 10) held the whole time, Balanced unless the user chooses. In
    a saving year W(t+1) = max(0, W(t) + s) × growth; in a withdrawal
    year W(t+1) = (W(t) − w) × growth, where growth =
    exp[(μ − σ²/2) + σZ]. The money has run out in the first year the
    balance is less than the withdrawal. A negative net worth counts as
    $0. The probability is the share of 4,000 fixed, seeded market paths
    on which the money lasts, so the same inputs always give the same
    result, and a bigger withdrawal or a later last age can never give a
    better chance. It is a GoalProbability, so it gets the verdicts of
    item 8.

    Results. With the probability and verdict the plan gives the balance
    at retirement (10th, 50th and 90th percentile), the median balance
    left at the last age, and the age the money runs out on an unlucky
    path (the 10th percentile, or none when it lasts there too). It can
    also give the chance at each of the five risk levels, and the
    largest yearly withdrawal, to the dollar, whose chance is at least a
    target (80%, the start of "Realistic", unless another is given); that
    is $0 when even $1 a year misses the target.

    Validation. The three ages are whole numbers from 18 to 120. The
    retirement age can't be before the current age (it can equal it:
    retiring this year), and the last age must be after the retirement
    age. Net worth is a number. Monthly saving is a number of $0 or more
    ($0 when left out). The yearly withdrawal is more than $0. The risk
    level is a whole number from 1 to 5. A plan can't be changed after
    it is created.

    Storage (planned). The ER diagram gets a `retirement_plan` table
    with `current_age`, `retirement_age`, `lasts_to_age`,
    `yearly_withdrawal` and `risk_level`, one row per profile; net worth
    and monthly saving come from the profile.

16. Your chances (page). Step 3 plans every goal together with
    MultiGoalPlanner (see 14). It shows a message instead while step 1's
    income and spending aren't valid, while there are no goals, or while
    the available funds have an error.

    Which goals. GoalList (`forPlanner`) decides: a goal is planned when
    its date is after today and no more than 40 years away, with `months`
    the whole months until its date (see 4). A goal whose date has passed
    since it was saved, or that is more than 40 years away, gets a card
    saying why ("Its date has passed." or "It's more than 40 years
    away.") with a link to edit it in step 2, and isn't planned. With no
    goal left to plan, step 3 says so. The job is the money for goals
    (see 5), the monthly cash flow and each planned goal's id, amount,
    months, priority and smallest acceptable amount, at risk level 5.

    Training. The planner starts 450 ms after the last change, so typing
    doesn't restart it on every key. While it trains, a progress bar
    shows the round ("round 40 of 180") and each goal's chance so far.
    A finished plan is kept for its job, so going back to the same inputs
    shows it at once. Renaming a goal or choosing another goal in step 2
    doesn't retrain. While a new plan trains, goals that were in the last
    plan keep their chance marked "Updating…", and the chart and scores
    are dimmed; the first time, they stay hidden until the plan is done.

    Goal cards. One card per goal, soonest first: its name, amount, date
    and priority, a ring and percent with the chance of reaching it in
    full or in part, and its verdict (see 8). A goal with a smallest
    acceptable amount that is sometimes reached only in part also says
    "62% in full, 21% more at the $15,000 you'd accept." Above the cards,
    the page explains the plan: the monthly saving until the last goal
    plus the money for goals, before any growth, against the total of
    all goals; when not every goal is Realistic it adds that the plan
    pays the most important goals first (and takes the smallest amount
    where one is set). Once done, screen readers hear "2 of your 3 goals
    are realistic." (or the one goal's chance).

    Money over time. A chart of the money for goals from today to the
    last goal (`client/views/timelineChart.js`): the typical market (50th
    percentile) as a line, a band from a bad to a good market (10th to
    90th), a straight drop at each goal's stop from the money before it
    is paid to the money after, and a dashed line at each goal with its
    name above (goals in the same month share one label, "Trip + 1
    more"; long names are cut to 20 characters; labels that would
    overlap go on another row, up to three). The amounts are on round
    gridlines from $0 ($10K, $20K…) and the years on the axis. Pointing
    at the chart, or using the arrow keys, Home and End once it has
    focus, picks a stop and says, for example, "June 2030, after House:
    about $7,900 in a typical market, $1,500 in a bad one and $14,000 in
    a good one."; with no stop picked it shows the last one. A goal's
    stop uses the goal's own date. The same numbers are in a table for
    screen readers. The chart is drawn at the width it has, so the text
    stays readable on a phone.

    What if. A slider changes the monthly saving in $50 steps, from what
    is saved now down to about $0 and up by the larger of $500 and what
    is saved now. It shows the amount and the change ("$1,900 a month
    (+$200)"). 120 ms after it stops, the page asks MultiGoalPlanner's
    `whatIf` (the DP estimate, so it needs no training) and lists, per
    goal, its chance before and after and the change in points ("+13
    points", "No change"). It runs in a worker of its own, so it answers
    while a plan trains, and only the newest slider value waits its
    turn. It changes nothing the user entered; "Back to what you save
    now" puts the slider back. A change to the job puts it back too.

    Scores. Under the chart: the plan's score (its utility) and the
    benchmark's, each out of the sum of the priorities ("9.3 of 10"),
    labelled "Our planner's score (PPO)" and "Best possible score (DP)",
    RL efficiency ("How close it gets (RL efficiency)", see 14), and how
    the planner invests as stages (see 14). After spending is recorded
    or removed on step 1, step 1 says how the goal chosen in step 2 moved
    once the new plan is done ("Your chance of reaching Car went from 39%
    to 8%." or "stays at 39%").

    Saving. Each plan the planner finishes is saved once through `POST
    /api/plans` (see 12) by the plan API client (`client/api/planApi.js`),
    with the body `MultiGoalPlan.toJSON()` gives. Under the scores the
    page says "Saving this plan…", then "This plan is saved.", or, in red,
    "This plan couldn't be saved." followed by the server's message (for
    example when the server can't be reached). A plan shown again from
    the ones kept on the page isn't saved twice; one that couldn't be
    saved is tried again when it is shown again. A page opened straight
    from disk has no server, so it saves nothing and says nothing.

17. Risk preference and ESG. RiskPreference (`src/riskPreference.js`)
    holds the highest risk level the plan may use (`maxRiskLevel`, a
    whole number from 1 to 5, "Choose a risk level from 1 to 5.") and
    whether the user wants values-based (ESG) investing (`esg`, true or
    false, "Choose whether to invest in ESG funds."). It starts at level
    5 without ESG, as in the MVP. `portfolios()` lists the portfolios up
    to that level, lowest risk first (see 10); with ESG on, each is the
    ESG version of the same risk level ("ESG Balanced"): funds screened
    for environmental, social and governance standards. We assume the
    same expected return and volatility as the regular portfolio, since
    studies don't show a consistent difference. `describe()` gives, for
    example, "Up to Balanced (level 3), ESG funds only".
