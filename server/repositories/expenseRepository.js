/* ============================================================
   ExpenseRepository: the SQL for the expense table. The only
   layer that knows its columns; filters by category, date range
   and note are done here in SQL.
   ============================================================ */

const COLUMNS = "expense_id, amount, date, note, category";

class ExpenseRepository {
  constructor(db) {
    this.db = db;
  }

  /* the spending recorded against the funds, oldest first. Each filter is optional: one category,
     dates from and to (both included), and search for text in the note (ignoring case). */
  findAll(fundsId, { category, from, to, search } = {}) {
    const where = ["funds_id = ?"];
    const values = [fundsId];
    if (category) { where.push("category = ?"); values.push(category); }
    if (from) { where.push("date >= ?"); values.push(from); }
    if (to) { where.push("date <= ?"); values.push(to); }
    if (search) {
      where.push("note LIKE ? ESCAPE '\\'");
      values.push("%" + search.replace(/[\\%_]/g, (c) => "\\" + c) + "%");
    }
    const rows = this.db.prepare(`
      SELECT ${COLUMNS} FROM expense WHERE ${where.join(" AND ")} ORDER BY date, expense_id
    `).all(...values);
    return rows.map(ExpenseRepository.#toExpense);
  }

  /* one recorded spending, or null when the funds have none with that id */
  findById(fundsId, expenseId) {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM expense WHERE funds_id = ? AND expense_id = ?`).get(fundsId, expenseId);
    return row ? ExpenseRepository.#toExpense(row) : null;
  }

  /* saves new spending and returns it with its id */
  create(fundsId, { amount, date, note, category }) {
    const result = this.db.prepare(`
      INSERT INTO expense (funds_id, amount, date, note, category) VALUES (?, ?, ?, ?, ?)
    `).run(fundsId, amount, date, note, category);
    return this.findById(fundsId, Number(result.lastInsertRowid));
  }

  /* changes every field of recorded spending and returns it */
  update(fundsId, expenseId, { amount, date, note, category }) {
    this.db.prepare(`
      UPDATE expense SET amount = ?, date = ?, note = ?, category = ? WHERE funds_id = ? AND expense_id = ?
    `).run(amount, date, note, category, fundsId, expenseId);
    return this.findById(fundsId, expenseId);
  }

  remove(fundsId, expenseId) {
    this.db.prepare("DELETE FROM expense WHERE funds_id = ? AND expense_id = ?").run(fundsId, expenseId);
  }

  static #toExpense(row) {
    return { id: row.expense_id, amount: row.amount, date: row.date, note: row.note, category: row.category };
  }
}

module.exports = ExpenseRepository;