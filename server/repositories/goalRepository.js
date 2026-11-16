/* ============================================================
   GoalRepository: the SQL for the goal table. The only layer
   that knows the table's columns; it hands the service plain
   objects with the API's camelCase field names. Every query is
   limited to one profile, so one user can't reach another's goals.
   ============================================================ */

const COLUMNS = "goal_id, name, target_amount, target_date, priority, min_acceptable_amount, created_at";

class GoalRepository {
  constructor(db) {
    this.db = db;
  }

  /* every goal of a profile, soonest target date first (then oldest first) */
  findAll(profileId) {
    const rows = this.db.prepare(`
      SELECT ${COLUMNS}
      FROM goal
      WHERE profile_id = ?
      ORDER BY target_date, goal_id
    `).all(profileId);
    return rows.map(GoalRepository.#toGoal);
  }

  /* one goal, or null when the profile has no goal with that id */
  findById(profileId, goalId) {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM goal WHERE profile_id = ? AND goal_id = ?`).get(profileId, goalId);
    return row ? GoalRepository.#toGoal(row) : null;
  }

  /* how many goals the profile has */
  count(profileId) {
    return this.db.prepare("SELECT COUNT(*) AS total FROM goal WHERE profile_id = ?").get(profileId).total;
  }

  /* saves a new goal and returns it with its id and createdAt */
  create(profileId, goal) {
    const result = this.db.prepare(`
      INSERT INTO goal (profile_id, name, target_amount, target_date, priority, min_acceptable_amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(profileId, goal.name, goal.targetAmount, goal.targetDate, goal.priority, goal.minAcceptableAmount);
    return this.findById(profileId, Number(result.lastInsertRowid));
  }

  /* changes every field of a goal, keeping its id and createdAt; returns it, or null when there's no such goal */
  update(profileId, goalId, goal) {
    const result = this.db.prepare(`
      UPDATE goal
      SET name = ?, target_amount = ?, target_date = ?, priority = ?, min_acceptable_amount = ?
      WHERE profile_id = ? AND goal_id = ?
    `).run(goal.name, goal.targetAmount, goal.targetDate, goal.priority, goal.minAcceptableAmount, profileId, goalId);
    return result.changes ? this.findById(profileId, goalId) : null;
  }

  /* deletes a goal (its saved results go with it, ON DELETE CASCADE); true when one was deleted */
  remove(profileId, goalId) {
    return this.db.prepare("DELETE FROM goal WHERE profile_id = ? AND goal_id = ?").run(profileId, goalId).changes > 0;
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