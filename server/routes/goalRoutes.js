/* ============================================================
   Routes for /api/goals: turn HTTP requests into GoalService
   calls and the results into JSON responses. No SQL and no
   business rules here.
   ============================================================ */

const express = require("express");

function goalRoutes(goalService) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json(goalService.listGoals());
  });

  return router;
}

module.exports = goalRoutes;
