/* ============================================================
   Routes for /api/funds and /api/expenses: turn HTTP requests
   into FundsService calls and the results into JSON responses.
   No SQL and no business rules here; a ServiceError from the
   service becomes its status code and JSON body.
   ============================================================ */

const express = require("express");
const ServiceError = require("../services/serviceError");

/* errors the service expects (400, 404, 409); anything else goes on to the app's 500 handler */
function sendServiceErrors(router) {
  router.use((error, req, res, next) => {
    if (!(error instanceof ServiceError)) return next(error);
    res.status(error.status).json(error.body);
  });
  return router;
}

function fundsRoutes(fundsService) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json(fundsService.getFunds());
  });

  router.put("/", (req, res) => {
    res.json(fundsService.setEntered(req.body));
  });

  return sendServiceErrors(router);
}

function expenseRoutes(fundsService) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const { category, from, to, search } = req.query;
    res.json(fundsService.listExpenses({ category, from, to, search }));
  });

  router.post("/", (req, res) => {
    res.status(201).json(fundsService.addExpense(req.body));
  });

  router.put("/:id", (req, res) => {
    res.json(fundsService.updateExpense(req.params.id, req.body));
  });

  router.delete("/:id", (req, res) => {
    fundsService.deleteExpense(req.params.id);
    res.status(204).end();
  });

  return sendServiceErrors(router);
}

module.exports = { fundsRoutes, expenseRoutes };