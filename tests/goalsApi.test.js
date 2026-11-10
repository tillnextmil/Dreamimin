// API tests for the server: GET /api/goals through all the layers (route, service, repository,
// SQLite), and the server serving the page but nothing else from the repository.
// Author: Aiyan Tong

const request = require("supertest");
const { openDatabase, PROFILE_ID } = require("../server/db");
const { createApp } = require("../server/app");

// A fresh in-memory database and app for each test.
let db, app;
beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp({ db });
});

afterEach(() => {
  db.close();
});

function addGoal({ name, targetAmount, targetDate, priority = 3, minAcceptableAmount = 0 }) {
  db.prepare(`
    INSERT INTO goal (profile_id, name, target_amount, target_date, priority, min_acceptable_amount)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(PROFILE_ID, name, targetAmount, targetDate, priority, minAcceptableAmount);
}

// edge case: a new database has no goals yet
test("GET /api/goals returns an empty list before any goal is saved", async () => {
  const res = await request(app).get("/api/goals");
  expect(res.status).toBe(200);
  expect(res.headers["content-type"]).toMatch(/application\/json/);
  expect(res.body).toEqual([]);
});

// normal case: saved goals come back in the contract's shape, soonest target date first
test("GET /api/goals returns the saved goals, soonest first", async () => {
  addGoal({ name: "Car", targetAmount: 12000, targetDate: "2028-06-01", priority: 4, minAcceptableAmount: 8000 });
  addGoal({ name: "Trip", targetAmount: 2500.5, targetDate: "2027-03-15" });

  const res = await request(app).get("/api/goals");

  expect(res.status).toBe(200);
  expect(res.body.map((goal) => goal.name)).toEqual(["Trip", "Car"]);
  expect(res.body[1]).toEqual({
    id: expect.any(Number),
    name: "Car",
    targetAmount: 12000,
    targetDate: "2028-06-01",
    priority: 4,
    minAcceptableAmount: 8000,
    createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  });
  expect(res.body[0].priority).toBe(3);             // the default
  expect(res.body[0].minAcceptableAmount).toBe(0);  // the default
});

// normal case: npm start serves the page and the domain classes it loads
test("serves the page and its scripts", async () => {
  const page = await request(app).get("/");
  expect(page.status).toBe(200);
  expect(page.text).toContain("<title>Dreamimin</title>");

  const script = await request(app).get("/src/financialGoal.js");
  expect(script.status).toBe(200);
  expect(script.headers["content-type"]).toMatch(/javascript/);
});

// wrong case: files that aren't part of the page are never served
test("doesn't serve the server code, package.json or the database", async () => {
  for (const path of ["/package.json", "/server/db.js", "/server/schema.sql", "/data/dreamimin.db", "/.git/config"]) {
    const res = await request(app).get(path);
    expect(res.status).toBe(404);
  }
});

// wrong case: an API route that doesn't exist answers with a JSON error, not the page
test("an unknown API route is a 404 with a JSON error", async () => {
  const res = await request(app).get("/api/nothing-here");
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: "There is no such API route." });
});
