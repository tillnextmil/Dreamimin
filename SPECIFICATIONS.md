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
   Clear everything button empties every field and removes any error
   messages. Inputs are not saved between visits. The page shows one of
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
