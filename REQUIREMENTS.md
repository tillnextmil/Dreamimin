# User Requirements

Dreamimin is a goals-based planner for people who have more financial
goals than money. The user enters their monthly money and the funds they
have, adds every goal with its cost, its date, how much it matters and
the least they would settle for, and sees the chance of reaching each
goal when all of them are planned together from the same money and
invested. Everything they enter is still there on their next visit. How
each number is worked out is in [SPECIFICATIONS.md](SPECIFICATIONS.md);
the proposal and the interviews these requirements come from are in
[docs/proposal-and-interviews.md](docs/proposal-and-interviews.md).

## Financial Profile

1. As a user, I can enter my monthly income, my monthly spending, and
   optionally my net worth.
2. As a user, I can see how much money I have left over each month, and
   clearly see when I spend more than I earn.
3. As a user, I can see my savings rate: the share of my income I keep
   each month.
4. As a user, I can set how much money to keep as an emergency fund, so
   my goals only count what is left after it and a goal I can afford
   never drains my safety cushion.

## Manage Funds

5. As a user, I can enter the funds I have available to put toward my
   goals, update them later, and see my results change with them.
6. As a user, I can record money that comes in or goes out outside my
   usual spending, such as a bonus or a car repair, so my available funds
   stay up to date, and edit or remove it later.
7. As a user, I can record what I spend with a category and a note, edit
   it, and remove it after confirming, so my available funds stay up to
   date and I can see how my spending affects my goals.
8. As a user, I can filter my recorded spending by category, by dates and
   by its note.
9. As a user, I can see in a chart which categories my spending went to.

## Goals

10. As a user, I can add as many goals as I need (up to 20), each with a
    name, a target amount, a target date, how important it is (priority 1
    to 5), and optionally the smallest amount I would accept instead of
    the full one.
11. As a user, I can change a goal's amount, importance or date partway
    through the plan, including extending its timeline without deleting
    it, and delete a goal after confirming.
12. As a user, I can search my goals by name and sort them by date,
    importance, amount or name.
13. As a user, I can check one goal on its own: how much I need to save
    each month to reach it by its date, whether what I have left each
    month is enough, and when I would reach it at my current pace.

## Investing and Risk

14. As a user, I can see the investment options my plan chooses from,
    from low risk to high risk, with how much each is expected to grow and
    how much it can rise and fall.
15. As a user, I can choose how much investment risk I am comfortable
    with, and my plan never goes riskier than that.
16. As a user, I can compare my chance of reaching each goal at each of
    the five risk levels, and preview the outcome before I confirm a
    change.
17. As a user, when extra money comes in I can choose between raising one
    of my goals and moving to a safer strategy, and see how each choice
    changes my chances first.

## My Chances

18. As a user, I can see the chance of reaching each of my goals when
    they are planned together from the same money, as a percentage, with
    the plan putting my most important goals first when the money can't
    cover all of them.
19. As a user, I get a verdict for each goal: Realistic, Within reach, A
    stretch, or Not realistic yet, and how much of the chance comes from
    reaching only the smallest amount I would accept.
20. As a user, I can see why: what I will have put away before any growth
    compared with what all my goals cost.
21. As a user, I can see which kind of portfolio the plan uses each year,
    and a chart of my money for goals over time in a bad, a typical and a
    good market, with the drop where each goal is paid.
22. As a user, I can move a slider to see how saving more or less each
    month would change each goal's chance, without changing what I
    entered.
23. As a user, I can see how the plan compares with a best-possible check
    of the same problem, so I know how far I can trust it.

## Retirement

24. As a user, I can enter my age, the age I want to retire at, how much I
    want to take out each year after that, and the age the money should
    last to, and see the chance that it lasts, with a verdict.

## Saved Between Visits

25. As a user, my profile, funds, spending, income and losses, goals, risk
    preference and latest plan are saved, so they are still there when I
    come back, and the plan I saw is shown again without waiting for it
    to be worked out.

## Using the App

26. As a user, the results update automatically when I change my money or
    my goals, and I am told what is wrong and how to fix it when I enter a
    value the app can't use.
27. As a user, I am asked before anything I can't easily undo happens:
    deleting a goal, removing spending, or clearing everything to start
    over.
28. As a user, the same inputs always give me the same chances.
29. As a user, I can use the app on my phone or my computer, and with a
    keyboard or a screen reader.

## Left Out

The order in which retirement money is drawn from different accounts,
and the tax on it, are left out; the professor agreed on 11/9 that
retirement with yearly withdrawals (24) is enough.
