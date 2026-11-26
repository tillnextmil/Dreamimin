/* ============================================================
   Routes for /api/plans: turn HTTP requests into PlanService
   calls and the results into JSON responses. No SQL and no
   business rules here; a ServiceError from the service becomes
   its status code and JSON body.
   ============================================================ */

const express = require("express");
const ServiceError = require("../services/serviceError");

function planRoutes(planService) {
  const router = express.Router();

  /* saves a plan the page worked out: 201 with the saved plan, its id and createdAt */
  router.post("/", (req, res) => {
    res.status(201).json(planService.savePlan(req.body));
  });
  
  /* the plan saved most recently: 200 with the plan, or 404 before the first */
  router.get("/latest", (req, res) => {
    res.json(planService.getLatestPlan());
  });

  /* errors the service expects (400, 404); anything else goes on to the app's 500 handler */
  router.use((error, req, res, next) => {
    if (!(error instanceof ServiceError)) return next(error);
    res.status(error.status).json(error.body);
  });

  return router;
}

module.exports = planRoutes;
