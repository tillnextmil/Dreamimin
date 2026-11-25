# Proposal and Interviews

Where Dreamimin started: our project proposal, the interviews we ran
before building it, and how the proposal's requirements carry into the
final [user requirements](../REQUIREMENTS.md).

The interview summaries below leave out the names and personal details of
the people we interviewed, since this repository is public. Our full
notes, the transcript and the signed consent forms are in the team's
shared Google Drive folder.

## Proposal

Our project is a goals-based budget manager for everyday people. It uses
a research model: the multi-goal dynamic programming method from Das,
Ostrov, et al. (2022) with long-term dynamic asset allocation under
asymmetric risk preferences. Our users are adults who manage their own
household money and have more financial goals than they can comfortably
pay for. They include young professionals, parents, students, veterans
and retirees. We can reach them through our own networks of family,
coworkers, roommates, classmates and campus groups such as the veterans'
center.

The core problem is that people juggle competing goals, like rent, a
car, a child's tuition, a vacation and an emergency fund, without enough
money to be sure of meeting all of them. Research also shows that people
feel a shortfall more strongly than an equal gain. That can lead them to
avoid investing entirely, even for goals decades away. Existing apps like
YNAB or Rocket Money track past spending. They don't help users decide
which goals to fully fund, partly fund or skip, or how cautiously to save
for each one. Our tool lets users rank their goals, say how much a missed
target would bother them, and see the estimated chance of reaching each
goal.

## Interviews

### A working professional saving for early retirement

Interview led by Jessica Chang; summary by Aiyan Tong and Jessica Chang.

- Their main goal is to retire around 50. They estimate when that is
  possible in a spreadsheet, changing their assumptions about investment
  growth, inflation, salary growth and future expenses.
- They put the most they can into a 401(k), keep several months of
  emergency savings, and invest what is left after other obligations;
  student debt limits how much extra they can put in.
- Unexpected costs interrupt the plan: when a medical bill wasn't covered
  by insurance, they put in less for a while to pay it.
- When buying, they weigh what something costs to own, not only its
  price, and a cheaper option often meets the need without feeling like a
  compromise.
- After losing money on very short-term trading, they kept investing for
  the long term in broad-market funds.
- They sometimes disagree with their financial advisor's strategy because
  it doesn't fit their goals and timeline; the disagreement is about the
  strategy, not the numbers.

Findings:

- Plans need to survive a temporary drop in saving without the user
  giving up their long-term goals.
- A cheaper version can fully satisfy a goal, so users should be able to
  say what outcome they actually need.
- Users who already model their money value assumptions they can see and
  change, and side-by-side comparisons of scenarios.
- Risk preferences depend on the kind of investment and the time horizon,
  so a user isn't simply "risk-averse" or "comfortable with risk".
- A suggested strategy should explain how it follows from the user's
  priorities, so they can judge whether it fits.

### A business student working part time

Interview and notes by Autiana Wallace.

- One income, saved in a high-yield account, with money sometimes going
  into a Roth IRA.
- Goals are paying off student loans and saving about $10,000; the goals
  shift with income and bills.
- Chooses between purchases by how practical they are, and now keeps a
  cushion of savings before any big purchase such as a trip.
- Cuts back on or spaces out everyday costs like food and gas to keep
  money for personal purchases and unexpected school or car bills.
- Puts small amounts toward long-term goals and plans to raise them as
  income grows.
- The hardest parts: finding more income, making money work for them, and
  resisting impulse spending.

### Prof. Daniel Ostrov, co-author of the research model (expert interview)

Discussion led by Jessica Chang; summary by Aiyan Tong.

- Get the results right before making them fast: start from the paper's
  two-goal example, compare with its published results, and check very
  simple cases by hand.
- Start small (a year or two, a few wealth values) before adding
  complexity; partial goals could wait until the basic version works.
- For investing, either limit the choices to a few portfolios or assume a
  fixed growth rate and focus on the decisions between goals.
- Ordinary users shouldn't have to give technical utility scores: they
  should see each goal's chance, pick one to improve, and see what
  changing its priority does, while the program adjusts the utilities.
- Raising one goal's chance usually lowers others', but some can rise
  too, so the page should show the actual changes rather than assume.
- Goals-based planning helps people see realistic tradeoffs; how people
  feel about risk decides which plans they will stick with.

What we took from it:

- Plain-language priorities and outcomes on the page; the model's
  parameters stay behind the scenes.
- Let users compare how a change affects every goal before accepting it.
- Build a small, testable version first and check its numbers before
  growing it.

## Personas

| | Sarah Jenkins (primary) | Marcus Thorne (secondary) |
|---|---|---|
| Who | A young professional paying off student loans, saving for a house, and traveling | A father of two balancing an emergency fund, college tuition and retirement |
| Goal flexibility | Accepts partial goals when money is tight | Needs goals fully met; tuition has to be fully funded |
| Risk | Takes calculated risks for growth, but fears losses more than she values gains | Avoids risk and prefers guaranteed returns |
| Time horizon | Several goals within the next few years | Decades-long goals |
| Decides by | Calculated probabilities and live data | Gut feeling and a fixed monthly budget |

## From the proposal's requirements to the final ones

Every requirement in our proposal is kept; most were "later" in the MVP
and are part of the final project.

| Proposal requirement | Final requirement |
|---|---|
| Enter financial goals with estimated costs and timelines | 10 |
| Give each goal an importance score | 10 |
| Set an acceptable partial-funding amount for a goal | 10, 19 |
| Enter current available funds | 5 |
| Update available funds when new income or unexpected losses come in | 6 |
| See a suggested risk-adjusted investment strategy | 21 |
| See the estimated probability of reaching each goal | 18 |
| Compare the probability of success across risk levels | 16 |
| Review projected outcomes before confirming a strategy change | 16, 17, 22 |
| Change a goal's target cost or importance partway through | 11 |
| See probabilities recalculate automatically after changing a goal | 26 |
| Extend a goal's timeline without deleting it | 11 |
| Choose between upgrading a goal and reducing risk when extra money comes in | 17 |
