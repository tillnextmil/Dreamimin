/* ============================================================
   ProfileRepository: the SQL for the profile table. The only
   layer that knows the table's columns; it hands the service a
   plain object with the API's camelCase field names.
   ============================================================ */

const COLUMNS = "profile_id, name, monthly_income, monthly_expenses, net_worth, emergency_fund";

class ProfileRepository {
  constructor(db) {
    this.db = db;
  }

  /* the profile, or null when there's no profile with that id */
  find(profileId) {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM profile WHERE profile_id = ?`).get(profileId);
    return row ? ProfileRepository.#toProfile(row) : null;
  }

  /* saves income, spending, net worth and the emergency fund; returns the profile, or null when there's none */
  update(profileId, { income, expenses, netWorth, emergencyFund }) {
    const result = this.db.prepare(`
      UPDATE profile
      SET monthly_income = ?, monthly_expenses = ?, net_worth = ?, emergency_fund = ?
      WHERE profile_id = ?
    `).run(income, expenses, netWorth, emergencyFund, profileId);
    return result.changes ? this.find(profileId) : null;
  }

  static #toProfile(row) {
    return {
      id: row.profile_id,
      name: row.name,
      income: row.monthly_income,
      expenses: row.monthly_expenses,
      netWorth: row.net_worth,
      emergencyFund: row.emergency_fund,
    };
  }
}

module.exports = ProfileRepository;