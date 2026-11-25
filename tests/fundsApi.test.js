// API tests for /api/funds and /api/expenses through every layer (route, service, repository,
// SQLite), checking the status codes and bodies of the contract (SPECIFICATIONS.md, item 12).
// Author: Autiana Wallace

const request = require("supertest");
const { openDatabase } = require("../server/db");
const { createApp } = require("../server/app");

// a date that's never in the future
const DINNER = { amount: 86, date: "2026-11-01", note: "Dinner", category: "food" };

let db, app;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp({ db });
});

afterEach(() => {
  db.close();
});

// normal case: PUT /api/funds saves the funds and GET reads them back
test("PUT and GET /api/funds", async () => {
  expect((await request(app).get("/api/funds")).body).toEqual({ entered: null, balance: null, totalSpent: 0, totalIncome: 0, totalLoss: 0 });
  const saved = await request(app).put("/api/funds").send({ entered: 2000 });
  expect(saved.status).toBe(200);
  expect(saved.body).toEqual({ entered: 2000, balance: 2000, totalSpent: 0, totalIncome: 0, totalLoss: 0 });
});

// normal case: POST, PUT and DELETE /api/expenses change the spending and the funds
test("records, edits and removes spending", async () => {
  await request(app).put("/api/funds").send({ entered: 1000 });

  const created = await request(app).post("/api/expenses").send(DINNER);
  expect(created.status).toBe(201);
  expect(created.body).toEqual({ id: expect.any(Number), ...DINNER });

  const edited = await request(app).put(`/api/expenses/${created.body.id}`).send({ ...DINNER, amount: 100 });
  expect(edited.status).toBe(200);
  expect((await request(app).get("/api/funds")).body.balance).toBe(900);

  const deleted = await request(app).delete(`/api/expenses/${created.body.id}`);
  expect(deleted.status).toBe(204);
  expect((await request(app).get("/api/funds")).body.balance).toBe(1000);
});

// normal case: GET /api/expenses passes the filters through
test("GET /api/expenses filters", async () => {
  await request(app).put("/api/funds").send({ entered: 1000 });
  await request(app).post("/api/expenses").send(DINNER);
  await request(app).post("/api/expenses").send({ ...DINNER, note: "Bus", category: "transport" });
  const res = await request(app).get("/api/expenses?category=transport");
  expect(res.status).toBe(200);
  expect(res.body.map((e) => e.note)).toEqual(["Bus"]);
});

// wrong case: invalid input is a 400, a rule the funds would break is a 409, an unknown id is a 404
test("400, 404 and 409 responses", async () => {
  expect((await request(app).post("/api/expenses").send(DINNER)).status).toBe(409);   // no funds yet
  await request(app).put("/api/funds").send({ entered: 50 });

  const invalid = await request(app).post("/api/expenses").send({ ...DINNER, amount: 0 });
  expect(invalid.status).toBe(400);
  expect(invalid.body).toEqual({ errors: { amount: "Spending amount must be more than $0." } });

  const tooMuch = await request(app).post("/api/expenses").send(DINNER);
  expect(tooMuch.status).toBe(409);
  expect(tooMuch.body).toEqual({ error: "That's more than your available funds." });

  const missing = await request(app).delete("/api/expenses/99");
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ error: "No spending with that id." });

  expect((await request(app).get("/api/expenses?category=pizza")).status).toBe(400);
});