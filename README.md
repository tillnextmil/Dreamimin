# Dreamimin

A goals-based financial planner. Enter your financial picture and a goal,
and it estimates your probability of reaching that goal.

Backend: Python + Flask. Frontend: HTML.

## One-time setup

1. Install [Python 3.12](https://www.python.org/downloads/) (3.10 or newer works).
2. Clone this repository and open it in VS Code.
3. In the repository folder, install the dependencies:

```
pip install -r requirements.txt
```

## Running the tests locally

This is the exact same command CI runs, so if it passes locally it will
pass in CI too:

```
pytest -v
```

## Project layout

```
src/        model code (planner logic) and the Flask app
tests/      unit tests; every tests/test_*.py file runs automatically
.github/    CI configuration
```

## Running the app

(To be filled in once the Flask app is added.)
