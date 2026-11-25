/* ============================================================
   Builds the Express app: the JSON API under /api and the page
   itself. Layers, each only calling the one below it:

     routes/        HTTP in and out (JSON, status codes)
     services/      what the app does; rules and validation
     repositories/  SQL for one table each
     src/           domain classes, shared with the page

   createApp takes the database instead of opening one, so tests
   can pass an in-memory database.
   ============================================================ */

const path = require("node:path");
const express = require("express");
const { PROFILE_ID } = require("./db");
const GoalRepository = require("./repositories/goalRepository");
const GoalService = require("./services/goalService");
const goalRoutes = require("./routes/goalRoutes");
const PlanRepository = require("./repositories/planRepository");
const PlanService = require("./services/planService");
const planRoutes = require("./routes/planRoutes");
const ProfileRepository = require("./repositories/profileRepository");
const ProfileService = require("./services/profileService");
const profileRoutes = require("./routes/profileRoutes");
const FundsRepository = require("./repositories/fundsRepository");
const ExpenseRepository = require("./repositories/expenseRepository");
const FundsEventRepository = require("./repositories/fundsEventRepository");
const FundsService = require("./services/fundsService");
const { fundsRoutes, expenseRoutes, fundsEventRoutes } = require("./routes/fundsRoutes");
const RiskPreferenceRepository = require("./repositories/riskPreferenceRepository");
const RiskPreferenceService = require("./services/riskPreferenceService");
const riskPreferenceRoutes = require("./routes/riskPreferenceRoutes");

const ROOT = path.join(__dirname, "..");
/* only the page's own files are served, never the database, package.json or the server code */
const PAGE_FILES = ["index.html", "styles.css", "logo.png"];

function createApp({ db }) {
  const goalRepository = new GoalRepository(db);
  const goalService = new GoalService(goalRepository, { profileId: PROFILE_ID });
  const planService = new PlanService(new PlanRepository(db), goalRepository, { profileId: PROFILE_ID });
  const profileService = new ProfileService(new ProfileRepository(db), { profileId: PROFILE_ID });
  const fundsService = new FundsService(
  new FundsRepository(db), new ExpenseRepository(db), new FundsEventRepository(db), { profileId: PROFILE_ID }
  );
  const riskPreferenceService = new RiskPreferenceService(new RiskPreferenceRepository(db), { profileId: PROFILE_ID });

  const app = express();
  app.use(express.json());

  app.use("/api/goals", goalRoutes(goalService));
  app.use("/api/risk-preference", riskPreferenceRoutes(riskPreferenceService));
  app.use("/api/funds", fundsRoutes(fundsService));
  app.use("/api/expenses", expenseRoutes(fundsService));
  app.use("/api/funds-events", fundsEventRoutes(fundsService));
  app.use("/api/plans", planRoutes(planService));
  app.use("/api/profile", profileRoutes(profileService));
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "There is no such API route." });
  });

  /* `root` keeps sendFile working when the repository sits inside a folder starting with "." */
  app.get("/", (req, res) => res.sendFile("index.html", { root: ROOT }));
  for (const file of PAGE_FILES) {
    app.get(`/${file}`, (req, res) => res.sendFile(file, { root: ROOT }));
  }
  app.use("/src", express.static(path.join(ROOT, "src")));
  app.use("/client", express.static(path.join(ROOT, "client")));

  /* a body that isn't valid JSON is the client's mistake; anything else is a bug on the server */
  app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "The request body isn't valid JSON." });
    }
    console.error(error);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

  return app;
}

module.exports = { createApp };
