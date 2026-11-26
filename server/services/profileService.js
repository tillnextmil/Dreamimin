/* ============================================================
   ProfileService: what the app does with the profile, between
   the routes (HTTP) and the repository (SQL). FinancialProfile
   (src/financialProfile.js) checks the values, the same rules
   the page uses (SPECIFICATIONS.md, items 2 and 12).
   ============================================================ */

const FinancialProfile = require("../../src/financialProfile");
const ServiceError = require("./serviceError");

const NOT_FOUND = "There is no profile yet.";

class ProfileService {
  /* profileId: the user whose profile this is (one profile until sign-in exists) */
  constructor(profileRepository, { profileId }) {
    this.profiles = profileRepository;
    this.profileId = profileId;
  }

  getProfile() {
    const profile = this.profiles.find(this.profileId);
    if (!profile) throw ServiceError.notFound(NOT_FOUND);
    return profile;
  }

  /* income and expenses are required; netWorth and emergencyFund default to 0; other fields are ignored */
  saveProfile(input) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const fields = {
      income: body.income,
      expenses: body.expenses,
      netWorth: body.netWorth === undefined ? 0 : body.netWorth,
      emergencyFund: body.emergencyFund === undefined ? 0 : body.emergencyFund,
    };
    const errors = FinancialProfile.validate(fields);
    if (Object.keys(errors).length) throw ServiceError.invalid(errors);
    const saved = this.profiles.update(this.profileId, fields);
    if (!saved) throw ServiceError.notFound(NOT_FOUND);
    return saved;
  }
  
  /* Start over: income and spending go back to empty, net worth and the emergency fund to $0 */
  resetProfile() {
    this.getProfile();   // 404 when there's no profile
    this.profiles.reset(this.profileId);
  }
}

module.exports = ProfileService;