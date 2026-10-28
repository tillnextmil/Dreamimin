# Specifications

1. Domain classes. The feature uses two classes from our domain model.
   FinancialProfile (`src/financialProfile.js`) stores an id, a name,
   monthly income, monthly expenses and net worth, provides the monthly
   cash flow and savings rate, and can be changed with updateIncome,
   updateExpenses and updateNetWorth. FinancialGoal (`src/financialGoal.js`)
   stores an id, a name, a target amount and a target date, and works out
   the months remaining, the monthly saving required, whether a monthly
   amount is on track, and how many months a monthly amount takes. The
   other domain classes (InvestmentPortfolio, GoalAnalysisResult,
   GoalProbability) are added in M2 with the planning algorithm.

2. Input validation. Monthly income and monthly spending are required;
   net worth is optional and is treated as 0 when empty. In money fields,
   spaces, commas and dollar signs are ignored, so "$4,500" is read as
   4500, and decimals are allowed; a field that still is not a number is
   rejected. Income and spending cannot be negative; net worth can be,
   since a person can owe more than they own. A goal needs a name of 1 to
   60 characters, an amount greater than $0, and a real calendar date
   after today. Both classes reject invalid values by throwing an error,
   and a FinancialProfile update with an invalid value leaves the profile
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
   rounded up) and the month it would be reached. When not on track and
   cash flow is positive, it shows the extra amount needed each month and
   when the goal would be reached at the current pace instead. The
   estimate assumes all monthly cash flow goes to the goal and leaves out
   existing savings and investment growth.

6. Updating results. Results are recalculated each time the user changes
   any field. The monthly money results are shown once income and
   spending are valid, and the goal check once the profile and the goal
   are both valid; otherwise each shows a message saying what to add. The
   Clear everything button empties every field and removes any error
   messages. Inputs are not saved between visits in M1.

7. Chance with investing (M2). Once the profile and the goal are both
   valid, the page shows the probability of reaching the goal if the user
   invests, from the PPO planner (`src/ppoPlanner.js`). Wealth starts at
   the net worth (0 when negative) and grows year by year with one of five
   portfolios, after-inflation returns, with the monthly cash flow added at
   the start of each year; a goal `n` months away is ceil(n / 12) years,
   with the yearly saving spread so the total saved is still n times the
   monthly cash flow. Goals more than 40 years away are not planned. The
   probability is how often the trained policy reaches the goal across
   4,000 fixed simulated markets. A dynamic-programming solution of the
   same problem is the benchmark, and RL efficiency is the planner's
   probability divided by the benchmark's, capped at 100%, and not shown
   when the benchmark is 0. The page also shows a verdict (Realistic at
   80% or more, Within reach at 50%, A stretch at 20%, otherwise Not
   realistic yet), the planner's portfolio each year along the typical
   path, and the 10th, 50th and 90th percentile outcomes. Training always
   starts from the same seed and never from an earlier run, so the same
   inputs always give the same result.
