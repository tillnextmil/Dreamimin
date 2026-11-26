// API tests for GET and PUT /api/profile through every layer (route, service, repository,
// SQLite), checking the status codes and bodies of the contract (SPECIFICATIONS.md, item 12).
// Author: Autiana Wallace

const request = require("supertest");
const { openDatabase } = require("../server/db");
const { createApp } = require("../server/app");

const VALID = { income: 4800, expenses: 3500, netWorth: 12000, emergencyFund: 4000 };

let db, app;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp({ db });
});

afterEach(() => {
  db.close();
});

// edge case: before the first PUT, income and spending are null
test("GET /api/profile before anything is saved", async () => {
  const res = await request(app).get("/api/profile");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ id: 1, name: "My profile", income: null, expenses: null, netWorth: 0, emergencyFund: 0 });
});

// normal case: PUT saves the profile and GET reads it back
test("PUT saves the profile and GET reads it back", async () => {
  const saved = await request(app).put("/api/profile").send(VALID);
  expect(saved.status).toBe(200);
  expect(saved.body).toEqual({ id: 1, name: "My profile", ...VALID });
  expect((await request(app).get("/api/profile")).body).toEqual(saved.body);
});

// wrong case: invalid values are a 400 with a message per field, and nothing changes
test("an invalid profile is a 400 and changes nothing", async () => {
  await request(app).put("/api/profile").send(VALID);
  const res = await request(app).put("/api/profile").send({ ...VALID, income: -1 });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ errors: { income: "Monthly income can't be negative." } });
  expect((await request(app).get("/api/profile")).body.income).toBe(4800);
});

// normal case: DELETE /api/profile empties the profile (Start over)
test("DELETE /api/profile empties the profile", async () => {
  await request(app).put("/api/profile").send(VALID);
  const res = await request(app).delete("/api/profile");
  expect(res.status).toBe(204);
  expect((await request(app).get("/api/profile")).body).toMatchObject({ income: null, expenses: null, netWorth: 0, emergencyFund: 0 });
});