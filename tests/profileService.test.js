// Unit tests for the profile's SQL (server/repositories/profileRepository.js) and rules
// (server/services/profileService.js): saving and reading the one profile, and rejecting
// invalid values with FinancialProfile's messages.
// Author: Autiana Wallace

const { openDatabase, PROFILE_ID } = require("../server/db");
const ProfileRepository = require("../server/repositories/profileRepository");
const ProfileService = require("../server/services/profileService");
const ServiceError = require("../server/services/serviceError");

const VALID = { income: 4800, expenses: 3500, netWorth: 12000, emergencyFund: 4000 };

let db, profiles, service;
beforeEach(() => {
  db = openDatabase(":memory:");
  profiles = new ProfileRepository(db);
  service = new ProfileService(profiles, { profileId: PROFILE_ID });
});

afterEach(() => {
  db.close();
});

// the ServiceError a call throws, so tests can check its status and body
function errorFrom(call) {
  try {
    call();
  } catch (error) {
    if (error instanceof ServiceError) return error;
    throw error;
  }
  throw new Error("expected a ServiceError");
}

// ---------- Repository (SQL) ----------

// edge case: before the first save, income and spending are null and the rest are 0
test("a new profile has no income or spending yet", () => {
  expect(profiles.find(PROFILE_ID)).toEqual({
    id: PROFILE_ID, name: "My profile", income: null, expenses: null, netWorth: 0, emergencyFund: 0,
  });
});

// normal case: update saves every field and find reads it back
test("update saves the values and find reads them back", () => {
  const saved = profiles.update(PROFILE_ID, VALID);
  expect(saved).toEqual({ id: PROFILE_ID, name: "My profile", ...VALID });
  expect(profiles.find(PROFILE_ID)).toEqual(saved);
});

// wrong case: a profile that doesn't exist isn't found or changed
test("an unknown profile isn't found or changed", () => {
  expect(profiles.find(99)).toBeNull();
  expect(profiles.update(99, VALID)).toBeNull();
});

// wrong case: the table's checks stop negative income, spending or emergency fund
test("the table rejects negative values", () => {
  expect(() => profiles.update(PROFILE_ID, { ...VALID, income: -1 })).toThrow();
  expect(() => profiles.update(PROFILE_ID, { ...VALID, emergencyFund: -1 })).toThrow();
  expect(profiles.find(PROFILE_ID).income).toBeNull();
});

// ---------- Service (rules) ----------

// normal case: a valid profile is saved and returned
test("saves a valid profile", () => {
  expect(service.saveProfile(VALID)).toEqual({ id: PROFILE_ID, name: "My profile", ...VALID });
  expect(service.getProfile()).toMatchObject(VALID);
});

// edge case: net worth and the emergency fund are optional, $0 is allowed, net worth can be
// negative, and fields that aren't part of the profile are ignored
test("fills in defaults, allows $0 and a negative net worth, and ignores unknown fields", () => {
  expect(service.saveProfile({ income: 0, expenses: 0, color: "red" })).toEqual({
    id: PROFILE_ID, name: "My profile", income: 0, expenses: 0, netWorth: 0, emergencyFund: 0,
  });
  expect(service.saveProfile({ ...VALID, netWorth: -2500 }).netWorth).toBe(-2500);
});

// wrong case: invalid values are a 400 with FinancialProfile's message for each field, and nothing is saved
test("rejects invalid values with a message per field", () => {
  const error = errorFrom(() => service.saveProfile({ income: -1, expenses: "3500", netWorth: null, emergencyFund: -5 }));
  expect(error.status).toBe(400);
  expect(error.body).toEqual({
    errors: {
      income: "Monthly income can't be negative.",
      expenses: "Monthly spending must be a number.",
      netWorth: "Net worth must be a number.",
      emergencyFund: "Emergency fund can't be negative.",
    },
  });
  expect(service.getProfile().income).toBeNull();
});

// wrong case: income and spending are required, and a body that isn't an object counts as empty
test.each([{}, undefined, null, "5000", []])("rejects %p because income and spending are missing", (body) => {
  expect(Object.keys(errorFrom(() => service.saveProfile(body)).body.errors)).toEqual(["income", "expenses"]);
});

// wrong case: a missing profile is a 404
test("a profile that doesn't exist is a 404", () => {
  const missing = new ProfileService(profiles, { profileId: 99 });
  expect(errorFrom(() => missing.getProfile()).status).toBe(404);
  expect(errorFrom(() => missing.saveProfile(VALID)).status).toBe(404);
});