-- The tables of our ER diagram (docs/er-diagram.drawio). Every table checks the same limits as
-- the API (SPECIFICATIONS.md, item 12), so a bad value can't be saved even by a bug in a route.
-- IF NOT EXISTS lets the server open a database file it created on an earlier run.

PRAGMA foreign_keys = ON;

-- Until sign-in exists there is one profile, created with the database (see server/db.js).
-- Income and spending are NULL until the user saves them.
CREATE TABLE IF NOT EXISTS profile (
  profile_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'My profile',
  monthly_income REAL CHECK (monthly_income >= 0),
  monthly_expenses REAL CHECK (monthly_expenses >= 0),
  net_worth REAL NOT NULL DEFAULT 0
);

-- The plan only uses portfolios up to max_risk_level; 5 lets it use all of them.
CREATE TABLE IF NOT EXISTS risk_preference (
  preference_id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL UNIQUE REFERENCES profile (profile_id) ON DELETE CASCADE,
  max_risk_level INTEGER NOT NULL DEFAULT 5 CHECK (max_risk_level BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS goal (
  goal_id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profile (profile_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  target_amount REAL NOT NULL CHECK (target_amount > 0),
  target_date TEXT NOT NULL CHECK (date(target_date) = target_date),
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  min_acceptable_amount REAL NOT NULL DEFAULT 0
    CHECK (min_acceptable_amount >= 0 AND min_acceptable_amount < target_amount),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- balance is the funds left now, after the spending, income and losses recorded against it
CREATE TABLE IF NOT EXISTS available_funds (
  funds_id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL UNIQUE REFERENCES profile (profile_id) ON DELETE CASCADE,
  balance REAL NOT NULL CHECK (balance >= 0)
);

CREATE TABLE IF NOT EXISTS expense (
  expense_id INTEGER PRIMARY KEY,
  funds_id INTEGER NOT NULL REFERENCES available_funds (funds_id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL CHECK (date(date) = date),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 60),
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('housing', 'food', 'transport', 'bills', 'health', 'fun', 'shopping', 'other'))
);

-- money that comes in (income) or goes out (loss) outside everyday spending
CREATE TABLE IF NOT EXISTS funds_event (
  event_id INTEGER PRIMARY KEY,
  funds_id INTEGER NOT NULL REFERENCES available_funds (funds_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'loss')),
  amount REAL NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL CHECK (date(date) = date),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 60)
);

-- the five portfolios from src/investmentPortfolio.js; portfolio_id is the risk level
CREATE TABLE IF NOT EXISTS investment_portfolio (
  portfolio_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  risk_level INTEGER NOT NULL UNIQUE CHECK (risk_level BETWEEN 1 AND 5),
  expected_return REAL NOT NULL,
  volatility REAL NOT NULL CHECK (volatility >= 0)
);

-- one plan the planner worked out for all the goals together
CREATE TABLE IF NOT EXISTS plan_result (
  plan_id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profile (profile_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  max_risk_level INTEGER NOT NULL CHECK (max_risk_level BETWEEN 1 AND 5),
  utility REAL NOT NULL CHECK (utility >= 0),
  dp_utility REAL NOT NULL CHECK (dp_utility >= 0),
  rl_efficiency REAL CHECK (rl_efficiency BETWEEN 0 AND 1)   -- NULL when there is no benchmark
);

-- many-to-many: a plan scores every goal, and a goal is scored in every plan
CREATE TABLE IF NOT EXISTS goal_result (
  plan_id INTEGER NOT NULL REFERENCES plan_result (plan_id) ON DELETE CASCADE,
  goal_id INTEGER NOT NULL REFERENCES goal (goal_id) ON DELETE CASCADE,
  p_full REAL NOT NULL CHECK (p_full BETWEEN 0 AND 1),
  p_partial REAL NOT NULL CHECK (p_partial BETWEEN 0 AND 1),
  verdict TEXT NOT NULL CHECK (verdict IN ('Realistic', 'Within reach', 'A stretch', 'Not realistic yet')),
  PRIMARY KEY (plan_id, goal_id)
);

-- many-to-many: the portfolios a plan invests in each year, and the share of the money in each
-- (allocation_percent from 0 to 1). The planner uses one portfolio a year, so for now each year
-- has one row with allocation_percent 1.
CREATE TABLE IF NOT EXISTS plan_year (
  plan_id INTEGER NOT NULL REFERENCES plan_result (plan_id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 40),
  portfolio_id INTEGER NOT NULL REFERENCES investment_portfolio (portfolio_id),
  allocation_percent REAL NOT NULL DEFAULT 1 CHECK (allocation_percent > 0 AND allocation_percent <= 1),
  PRIMARY KEY (plan_id, year, portfolio_id)
);
