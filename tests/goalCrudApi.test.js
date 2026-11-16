// API tests for creating, reading, editing and deleting goals through every layer
// (route, service, repository, SQLite), checking the status codes and bodies of the contract.
// Author: Autiana Wallace

const request = require("supertest");
const { openDatabase } = require("../server/db");
const { createApp } = require("../server/app");

// A date far enough ahead that the goal is valid whenever the tests run.
const CAR = { name: "Car", targetAmount: 12000, targetDate: "2099-06-01", priority: 4, minAcceptableAmount: 8000 };

let db, app;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp({ db });
});

afterEach(() => {
  db.close();
});

// normal case: POST creates a goal (201) and GET /:id reads it back
test("POST creates a goal and GET reads it back", async () => {
  const created = await request(app).post("/api/goals").send(CAR);
  expect(created.status).toBe(201);
  expect(created.body).toEqual({ id: expect.any(Number), ...CAR, createdAt: expect.any(String) });

  const read = await request(app).get(`/api/goals/${created.body.id}`);
  expect(read.status).toBe(200);
  expect(read.body).toEqual(created.body);
});

// normal case: PUT edits every field and keeps the id; DELETE removes the goal (204, no body)
test("PUT edits a goal and DELETE removes it", async () => {
  const { body: goal } = await request(app).post("/api/goals").send(CAR);

  const edited = await request(app).put(`/api/goals/${goal.id}`).send({ ...CAR, targetDate: "2099-12-01" });
  expect(edited.status).toBe(200);
  expect(edited.body).toEqual({ ...goal, targetDate: "2099-12-01" });

  const deleted = await request(app).delete(`/api/goals/${goal.id}`);
  expect(deleted.status).toBe(204);
  expect(deleted.text).toBe("");
  expect((await request(app).get("/api/goals")).body).toEqual([]);
});

// normal case: GET /api/goals passes sort and search through to the service
test("GET /api/goals sorts and searches", async () => {
  await request(app).post("/api/goals").send({ ...CAR, name: "Car", priority: 2 });
  await request(app).post("/api/goals").send({ ...CAR, name: "Trip", priority: 5 });
  const res = await request(app).get("/api/goals?sort=priority&search=r");
  expect(res.status).toBe(200);
  expect(res.body.map((g) => g.name)).toEqual(["Trip", "Car"]);
});

// wrong case: invalid input is a 400 with a message per field
test("an invalid goal is a 400 with a message per field", async () => {
  const res = await request(app).post("/api/goals").send({ ...CAR, name: "", priority: 0 });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ errors: { name: "Give your goal a name.", priority: "Choose a priority from 1 to 5." } });
});

// wrong case: an unknown sort is a 400
test("an unknown sort is a 400", async () => {
  const res = await request(app).get("/api/goals?sort=color");
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ errors: { sort: "Sort by date, priority, amount or name." } });
});

// wrong case: an unknown id is a 404 for GET, PUT and DELETE
test("an unknown id is a 404", async () => {
  for (const res of [
    await request(app).get("/api/goals/99"),
    await request(app).put("/api/goals/99").send(CAR),
    await request(app).delete("/api/goals/abc"),
  ]) {
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "No goal with that id." });
  }
});

// edge case: the 21st goal is a 409
test("a 21st goal is a 409", async () => {
  for (let i = 1; i <= 20; i++) await request(app).post("/api/goals").send({ ...CAR, name: `Goal ${i}` });
  const res = await request(app).post("/api/goals").send({ ...CAR, name: "Goal 21" });
  expect(res.status).toBe(409);
  expect(res.body).toEqual({ error: "You can have up to 20 goals." });
});