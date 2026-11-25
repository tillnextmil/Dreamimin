/* ============================================================
   RiskPreferenceService: the user's risk preference, between
   the routes (HTTP) and the repository (SQL). RiskPreference
   (src/riskPreference.js) checks the values, the same rules the
   page uses (SPECIFICATIONS.md, items 12 and 17).
   ============================================================ */

const RiskPreference = require("../../src/riskPreference");
const ServiceError = require("./serviceError");

class RiskPreferenceService {
  constructor(riskPreferenceRepository, { profileId }) {
    this.preferences = riskPreferenceRepository;
    this.profileId = profileId;
  }

  /* { maxRiskLevel, esg }; level 5 without ESG until the user chooses */
  getPreference() {
    return this.preferences.find(this.profileId) || { maxRiskLevel: RiskPreference.MAX_RISK_LEVEL, esg: false };
  }

  /* maxRiskLevel is required; esg is optional and keeps its saved value when left out */
  savePreference(input) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const fields = { maxRiskLevel: body.maxRiskLevel, esg: body.esg === undefined ? this.getPreference().esg : body.esg };
    const errors = RiskPreference.validate(fields);
    if (Object.keys(errors).length) throw ServiceError.invalid(errors);
    return this.preferences.save(this.profileId, fields);
  }
}

module.exports = RiskPreferenceService;