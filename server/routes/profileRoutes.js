/* ============================================================
   Routes for /api/profile: turn HTTP requests into
   ProfileService calls and the results into JSON responses.
   No SQL and no business rules here; a ServiceError from the
   service becomes its status code and JSON body.
   ============================================================ */

const express = require("express");
const ServiceError = require("../services/serviceError");

function profileRoutes(profileService) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json(profileService.getProfile());
  });

  router.put("/", (req, res) => {
    res.json(profileService.saveProfile(req.body));
  });

  router.delete("/", (req, res) => {
    profileService.resetProfile();
    res.status(204).end();
  });
  
  /* errors the service expects (400, 404); anything else goes on to the app's 500 handler */
  router.use((error, req, res, next) => {
    if (!(error instanceof ServiceError)) return next(error);
    res.status(error.status).json(error.body);
  });

  return router;
}

module.exports = profileRoutes;