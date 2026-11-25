// API tests for /api/funds-events through every layer (route, service, repository, SQLite),
// checking the status codes and bodies of the contract (SPECIFICATIONS.md, item 12).
// Author: Autiana Wallace

const request = require("supertest");
const { openDatabase } = require("../server/db");
const { createApp } = require("../server/app");

// a date that's never in the future
const BONUS = { kind: "income", amount: 800, date: "2026-11-01", note: "Bonus" };

let db, app;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp({ db });
});

afterEach(() => {
  db.close();
});

// normal case: POST, GET, PUT and DELETE /api/funds-events, with the funds following along
test("records, lists, edits and removes income", async () => {
  await request(app).put("/api/funds").send({ entered: 1000 });

  const created = await request(app).post("/api/funds-events").send(BONUS);
  expect(created.status).toBe(201);
  expect(created.body).toEqual({ id: expect.any(Number), ...BONUS });
  expect((await request(app).get("/api/funds")).body).toMatchObject({ balance: 1800, totalIncome: 800 });

  expect((await request(app).get("/api/funds-events?kind=income")).body).toHaveLength(1);
  expect((await request(app).get("/api/funds-events?kind=loss")).body).toEqual([]);

  const edited = await request(app).put(`/api/funds-events/${created.body.id}`).send({ ...BONUS, kind: "loss", amount: 200 });
  expect(edited.status).toBe(200);
  expect((await request(app).get("/api/funds")).body).toMatchObject({ balance: 800, totalIncome: 0, totalLoss: 200 });

  expect((await request(app).delete(`/api/funds-events/${created.body.id}`)).status).toBe(204);
  expect((await request(app).get("/api/funds")).body.balance).toBe(1000);
});

// wrong case: 400, 404 and 409 responses
test("400, 404 and 409 responses", async () => {
  expect((await request(app).post("/api/funds-events").send(BONUS)).status).toBe(409);   // no funds yet
  await request(app).put("/api/funds").send({ entered: 100 });

  const invalid = await request(app).post("/api/funds-events").send({ ...BONUS, kind: "gift" });
  expect(invalid.status).toBe(400);
  expect(invalid.body).toEqual({ errors: { kind: "Choose income or loss." } });

  const tooBig = await request(app).post("/api/funds-events").send({ ...BONUS, kind: "loss", amount: 500 });
  expect(tooBig.status).toBe(409);
  expect(tooBig.body).toEqual({ error: "That's more than your available funds." });

  const missing = await request(app).delete("/api/funds-events/99");
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ error: "No income or loss with that id." });

  expect((await request(app).get("/api/funds-events?kind=gift")).status).toBe(400);
});