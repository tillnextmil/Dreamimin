// Unit tests for the page's goal API client (client/api/goalApi.js): MemoryGoalApi follows the API
// contract in SPECIFICATIONS.md, item 12, and HttpGoalApi sends the contract's requests and turns
// error responses into ApiErrors.
// Author: Aiyan Tong

const { HttpGoalApi, MemoryGoalApi, ApiError } = require("../client/api/goalApi");
const format = require("../client/format");

const NOW = new Date(2099, 0, 15, 9, 30);
const CAR = { name: "Car", targetAmount: 12000, targetDate: "2100-06-01", priority: 4, minAcceptableAmount: 8000 };
const TRIP = { name: "Trip", targetAmount: 2500, targetDate: "2099-08-01" };

// the error a promise rejects with, so its status and messages can be checked
const failure = (promise) => promise.then(() => { throw new Error("expected the request to fail"); }, (error) => error);

describe("MemoryGoalApi", () => {
  let api;
  beforeEach(() => {
    api = new MemoryGoalApi({ now: () => NOW });
  });

  // normal case: a created goal comes back with an id, its fields, the defaults and createdAt
  test("creates a goal and lists it", async () => {
    const car = await api.create(CAR);
    expect(car).toEqual({ id: 1, ...CAR, createdAt: NOW.toISOString() });
    const trip = await api.create(TRIP);
    expect(trip).toMatchObject({ id: 2, priority: 3, minAcceptableAmount: 0 });
    expect((await api.list()).map((g) => g.name)).toEqual(["Trip", "Car"]);   // soonest first
  });

  // normal case: sort and search go through GoalList
  test("lists with sort and search", async () => {
    await api.create(CAR);
    await api.create(TRIP);
    expect((await api.list({ sort: "priority" })).map((g) => g.name)).toEqual(["Car", "Trip"]);
    expect((await api.list({ search: "tri" })).map((g) => g.name)).toEqual(["Trip"]);
  });

  // normal case: editing keeps the id and createdAt, so extending the timeline loses nothing
  test("updates a goal in place", async () => {
    const car = await api.create(CAR);
    const later = await api.update(car.id, { ...CAR, targetDate: "2101-01-01", targetAmount: 14000 });
    expect(later).toEqual({ ...car, targetDate: "2101-01-01", targetAmount: 14000 });
    expect(await api.get(car.id)).toEqual(later);
  });

  // normal case: deleting removes the goal
  test("deletes a goal", async () => {
    const car = await api.create(CAR);
    expect(await api.remove(car.id)).toBeNull();
    expect(await api.list()).toEqual([]);
  });

  // edge case: what the API returns is a copy, so changing it doesn't change the saved goal
  test("returns copies", async () => {
    const car = await api.create(CAR);
    car.name = "Changed";
    (await api.list())[0].name = "Changed again";
    expect((await api.get(car.id)).name).toBe("Car");
  });

  // wrong case: invalid fields are a 400 with a message per field, and nothing is saved
  test("rejects an invalid goal with a message per field", async () => {
    const error = await failure(api.create({ name: " ", targetAmount: 0, targetDate: "2099-01-15", priority: 7 }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.errors).toEqual({
      name: "Give your goal a name.",
      targetAmount: "Goal amount must be more than $0.",
      targetDate: "Target date must be after today.",
      priority: "Choose a priority from 1 to 5.",
    });
    expect(await api.list()).toEqual([]);
  });

  // wrong case: an invalid edit changes nothing
  test("an invalid edit leaves the goal as it was", async () => {
    const car = await api.create(CAR);
    const error = await failure(api.update(car.id, { ...CAR, minAcceptableAmount: 20000 }));
    expect(error.status).toBe(400);
    expect(await api.get(car.id)).toEqual(car);
  });

  // edge case: the 21st goal is a 409
  test("allows 20 goals and rejects the 21st", async () => {
    for (let i = 1; i <= 20; i++) await api.create({ ...TRIP, name: `Goal ${i}` });
    const error = await failure(api.create(TRIP));
    expect(error.status).toBe(409);
    expect(error.message).toBe("You can have up to 20 goals.");
    expect(await api.list()).toHaveLength(20);
  });

  // wrong case: an unknown id is a 404, for every request that takes one
  test("an unknown id is a 404", async () => {
    for (const request of [api.get(99), api.update(99, CAR), api.remove(99)]) {
      const error = await failure(request);
      expect(error.status).toBe(404);
      expect(error.message).toBe("No goal with that id.");
    }
  });

  // wrong case: an unknown sort is a 400
  test("an unknown sort is a 400", async () => {
    const error = await failure(api.list({ sort: "size" }));
    expect(error.status).toBe(400);
    expect(error.errors).toEqual({ sort: "Sort by date, priority, amount or name." });
  });
});

describe("HttpGoalApi", () => {
  // a fetch that records each request and answers with the given status and body
  function fakeFetch(status, body) {
    const calls = [];
    const fetch = async (url, options) => {
      calls.push({ url, ...options, body: options.body && JSON.parse(options.body) });
      return { status, ok: status >= 200 && status < 300, json: async () => body };
    };
    return { fetch, calls };
  }

  // normal case: list sends sort and search as a query string
  test("lists goals with the sort and search in the address", async () => {
    const { fetch, calls } = fakeFetch(200, [{ id: 1, ...CAR }]);
    const goals = await new HttpGoalApi({ fetch }).list({ sort: "name", search: "car & co" });
    expect(goals).toEqual([{ id: 1, ...CAR }]);
    expect(calls[0]).toMatchObject({ url: "/api/goals?sort=name&search=car+%26+co", method: "GET" });
  });

  // normal case: create and update send only the editable fields as JSON
  test("creates and updates with the goal's fields as JSON", async () => {
    const { fetch, calls } = fakeFetch(201, { id: 3, ...CAR });
    const api = new HttpGoalApi({ fetch });
    await api.create({ ...CAR, id: 3, createdAt: "x" });
    await api.update(3, CAR);
    expect(calls[0]).toMatchObject({ url: "/api/goals", method: "POST", body: CAR });
    expect(calls[0].headers).toEqual({ "Content-Type": "application/json" });
    expect(calls[1]).toMatchObject({ url: "/api/goals/3", method: "PUT", body: CAR });
  });

  // edge case: a 204 has no body
  test("delete resolves to null on 204", async () => {
    const { fetch, calls } = fakeFetch(204, undefined);
    expect(await new HttpGoalApi({ fetch }).remove(3)).toBeNull();
    expect(calls[0]).toMatchObject({ url: "/api/goals/3", method: "DELETE" });
  });

  // wrong case: error responses become ApiErrors with the server's messages
  test("turns 400, 404 and 409 responses into ApiErrors", async () => {
    let error = await failure(new HttpGoalApi(fakeFetch(400, { errors: { name: "Give your goal a name." } })).create(CAR));
    expect(error).toMatchObject({ status: 400, errors: { name: "Give your goal a name." }, message: "Give your goal a name." });
    error = await failure(new HttpGoalApi(fakeFetch(404, { error: "No goal with that id." })).get(9));
    expect(error).toMatchObject({ status: 404, errors: null, message: "No goal with that id." });
    error = await failure(new HttpGoalApi(fakeFetch(409, { error: "You can have up to 20 goals." })).create(CAR));
    expect(error.status).toBe(409);
  });

  // wrong case: no server at all
  test("says so when the server can't be reached", async () => {
    const fetch = async () => { throw new TypeError("Failed to fetch"); };
    const error = await failure(new HttpGoalApi({ fetch }).list());
    expect(error).toMatchObject({ status: 0, message: "Couldn't reach the server. Check that it's running and try again." });
  });
});

describe("reading amounts typed in a field", () => {
  // normal case: commas, spaces and dollar signs are ignored
  test.each([["4500", 4500], ["$4,500", 4500], [" 1 200.50 ", 1200.5], ["-3", -3], [".5", 0.5]])("reads %p as %p", (text, value) => {
    expect(format.parseAmount(text)).toBe(value);
  });

  // edge and wrong cases: empty is null; anything else that isn't a number is NaN
  test("empty is null and words are NaN", () => {
    expect(format.parseAmount("")).toBeNull();
    expect(format.parseAmount("  ")).toBeNull();
    expect(format.parseAmount("12k")).toBeNaN();
    expect(format.parseAmount("1.2.3")).toBeNaN();
  });

  test("writes dates the way date inputs expect", () => {
    expect(format.isoDate(new Date(2027, 2, 5))).toBe("2027-03-05");
  });
});
