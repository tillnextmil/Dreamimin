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

  /* both fields are optional: one that's left out keeps its saved value, so the page can send
  only the level or only the ESG choice */
  savePreference(input) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const saved = this.getPreference();
    const fields = {
      maxRiskLevel: body.maxRiskLevel === undefined ? saved.maxRiskLevel : body.maxRiskLevel,
      esg: body.esg === undefined ? saved.esg : body.esg,
    };
    const errors = RiskPreference.validate(fields);
    if (Object.keys(errors).length) throw ServiceError.invalid(errors);
    return this.preferences.save(this.profileId, fields);
  }
}

module.exports = RiskPreferenceService;