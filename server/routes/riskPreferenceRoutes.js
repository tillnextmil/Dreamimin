/* ============================================================
   Routes for /api/risk-preference: turn HTTP requests into
   RiskPreferenceService calls and the results into JSON
   responses. No SQL and no business rules here; a ServiceError
   from the service becomes its status code and JSON body.
   ============================================================ */

const express = require("express");
const ServiceError = require("../services/serviceError");

function riskPreferenceRoutes(riskPreferenceService) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json(riskPreferenceService.getPreference());
  });

  router.put("/", (req, res) => {
    res.json(riskPreferenceService.savePreference(req.body));
  });

  /* errors the service expects (400); anything else goes on to the app's 500 handler */
  router.use((error, req, res, next) => {
    if (!(error instanceof ServiceError)) return next(error);
    res.status(error.status).json(error.body);
  });

  return router;
}

module.exports = riskPreferenceRoutes;