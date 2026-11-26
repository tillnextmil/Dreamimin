/* ============================================================
   FundsRepository: the SQL for the available_funds table, one
   row per profile once the user has entered their funds. It
   hands the service plain objects with camelCase names.
   ============================================================ */

class FundsRepository {
  constructor(db) {
    this.db = db;
  }

  /* the profile's funds { id, entered, balance }, or null before the funds are first entered */
  find(profileId) {
    const row = this.db.prepare("SELECT funds_id, entered, balance FROM available_funds WHERE profile_id = ?").get(profileId);
    return row ? { id: row.funds_id, entered: row.entered, balance: row.balance } : null;
  }

  /* saves the entered amount and the balance, adding the row the first time; returns the funds */
  save(profileId, { entered, balance }) {
    this.db.prepare(`
      INSERT INTO available_funds (profile_id, entered, balance) VALUES (?, ?, ?)
      ON CONFLICT (profile_id) DO UPDATE SET entered = excluded.entered, balance = excluded.balance
    `).run(profileId, entered, balance);
    return this.find(profileId);
  }
  
  /* removes the profile's funds; the spending, income and losses recorded against them go too (ON DELETE CASCADE) */
  remove(profileId) {
    this.db.prepare("DELETE FROM available_funds WHERE profile_id = ?").run(profileId);
  }

  /* saves a new balance after spending changes */
  updateBalance(fundsId, balance) {
    this.db.prepare("UPDATE available_funds SET balance = ? WHERE funds_id = ?").run(balance, fundsId);
  }

  /* runs work() so that all its changes are saved, or none of them if it throws */
  transaction(work) {
    this.db.exec("BEGIN");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

module.exports = FundsRepository;