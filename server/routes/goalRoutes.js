/* ============================================================
   Routes for /api/goals: turn HTTP requests into GoalService
   calls and the results into JSON responses. No SQL and no
   business rules here; a ServiceError from the service becomes
   its status code and JSON body.
   ============================================================ */

const express = require("express");
const ServiceError = require("../services/serviceError");

function goalRoutes(goalService) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json(goalService.listGoals({ sort: req.query.sort, search: req.query.search }));
  });

  router.get("/:id", (req, res) => {
    res.json(goalService.getGoal(req.params.id));
  });

  router.post("/", (req, res) => {
    res.status(201).json(goalService.createGoal(req.body));
  });

  router.put("/:id", (req, res) => {
    res.json(goalService.updateGoal(req.params.id, req.body));
  });

  router.delete("/:id", (req, res) => {
    goalService.deleteGoal(req.params.id);
    res.status(204).end();
  });

  /* errors the service expects (400, 404, 409); anything else goes on to the app's 500 handler */
  router.use((error, req, res, next) => {
    if (!(error instanceof ServiceError)) return next(error);
    res.status(error.status).json(error.body);
  });

  return router;
}

module.exports = goalRoutes;