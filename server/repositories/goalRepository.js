/* ============================================================
   GoalRepository: the SQL for the goal table. The only layer
   that knows the table's columns; it hands the service plain
   objects with the API's camelCase field names.
   ============================================================ */

class GoalRepository {
  constructor(db) {
    this.db = db;
  }

  /* every goal of a profile, soonest target date first (then oldest first) */
  findAll(profileId) {
    const rows = this.db.prepare(`
      SELECT goal_id, name, target_amount, target_date, priority, min_acceptable_amount, created_at
      FROM goal
      WHERE profile_id = ?
      ORDER BY target_date, goal_id
    `).all(profileId);
    return rows.map(GoalRepository.#toGoal);
  }

  static #toGoal(row) {
    return {
      id: row.goal_id,
      name: row.name,
      targetAmount: row.target_amount,
      targetDate: row.target_date,
      priority: row.priority,
      minAcceptableAmount: row.min_acceptable_amount,
      createdAt: row.created_at,
    };
  }
}

module.exports = GoalRepository;
