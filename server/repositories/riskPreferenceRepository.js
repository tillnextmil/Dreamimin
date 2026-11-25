/* ============================================================
   RiskPreferenceRepository: the SQL for the risk_preference
   table, one row per profile. SQLite has no true/false, so esg
   is stored as 1 or 0 and handed to the service as a boolean.
   ============================================================ */

class RiskPreferenceRepository {
  constructor(db) {
    this.db = db;
  }

  /* { maxRiskLevel, esg }, or null when the profile has no risk preference */
  find(profileId) {
    const row = this.db.prepare("SELECT max_risk_level, esg FROM risk_preference WHERE profile_id = ?").get(profileId);
    return row ? { maxRiskLevel: row.max_risk_level, esg: row.esg === 1 } : null;
  }

  /* saves the level and the ESG choice, adding the row if it's missing; returns the preference */
  save(profileId, { maxRiskLevel, esg }) {
    this.db.prepare(`
      INSERT INTO risk_preference (profile_id, max_risk_level, esg) VALUES (?, ?, ?)
      ON CONFLICT (profile_id) DO UPDATE SET max_risk_level = excluded.max_risk_level, esg = excluded.esg
    `).run(profileId, maxRiskLevel, esg ? 1 : 0);
    return this.find(profileId);
  }
}

module.exports = RiskPreferenceRepository;