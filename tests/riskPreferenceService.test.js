// Unit tests for the risk preference's SQL (server/repositories/riskPreferenceRepository.js)
// and rules (server/services/riskPreferenceService.js).
// Author: Autiana Wallace

const { openDatabase, PROFILE_ID } = require("../server/db");
const RiskPreferenceRepository = require("../server/repositories/riskPreferenceRepository");
const RiskPreferenceService = require("../server/services/riskPreferenceService");
const ServiceError = require("../server/services/serviceError");

let db, preferences, service;
beforeEach(() => {
  db = openDatabase(":memory:");
  preferences = new RiskPreferenceRepository(db);
  service = new RiskPreferenceService(preferences, { profileId: PROFILE_ID });
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

// edge case: a new database starts at level 5 without ESG, as in the MVP
test("starts at level 5 without ESG", () => {
  expect(service.getPreference()).toEqual({ maxRiskLevel: 5, esg: false });
});

// normal case: the level and ESG choice are saved (ESG as 1 in SQL) and read back as a boolean
test("saves the level and ESG choice", () => {
  expect(service.savePreference({ maxRiskLevel: 3, esg: true })).toEqual({ maxRiskLevel: 3, esg: true });
  expect(db.prepare("SELECT max_risk_level, esg FROM risk_preference").get()).toEqual({ max_risk_level: 3, esg: 1 });
  expect(service.getPreference()).toEqual({ maxRiskLevel: 3, esg: true });
});

// edge case: leaving out esg keeps the saved choice; unknown fields are ignored
test("keeps the saved ESG choice when esg is left out", () => {
  service.savePreference({ maxRiskLevel: 2, esg: true });
  expect(service.savePreference({ maxRiskLevel: 4, color: "red" })).toEqual({ maxRiskLevel: 4, esg: true });
});

// wrong case: invalid values are a 400 with a message per field, and nothing changes
test("rejects an invalid level or ESG choice", () => {
  service.savePreference({ maxRiskLevel: 3, esg: false });
  const error = errorFrom(() => service.savePreference({ maxRiskLevel: 6, esg: "yes" }));
  expect(error.status).toBe(400);
  expect(error.body).toEqual({
    errors: { maxRiskLevel: "Choose a risk level from 1 to 5.", esg: "Choose whether to invest in ESG funds." },
  });
  expect(service.getPreference()).toEqual({ maxRiskLevel: 3, esg: false });
});

// wrong case: the level is required, and a body that isn't an object counts as empty
test.each([{}, undefined, "3", []])("rejects %p because the level is missing", (body) => {
  expect(errorFrom(() => service.savePreference(body)).body.errors).toEqual({ maxRiskLevel: "Choose a risk level from 1 to 5." });
});

// wrong case: the table's checks stop a bad level or ESG value even if the service is skipped
test("the table rejects a bad level or ESG value", () => {
  expect(() => preferences.save(PROFILE_ID, { maxRiskLevel: 0, esg: false })).toThrow();
  expect(() => db.prepare("UPDATE risk_preference SET esg = 2").run()).toThrow();
  expect(service.getPreference()).toEqual({ maxRiskLevel: 5, esg: false });
});