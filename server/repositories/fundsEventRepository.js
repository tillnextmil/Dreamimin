/* ============================================================
   FundsEventRepository: the SQL for the funds_event table
   (recorded income and losses). The only layer that knows its
   columns; it hands the service plain objects.
   ============================================================ */

const COLUMNS = "event_id, kind, amount, date, note";

class FundsEventRepository {
  constructor(db) {
    this.db = db;
  }

  /* the income and losses recorded against the funds, oldest first; kind ("income" or "loss") is optional */
  findAll(fundsId, { kind } = {}) {
    const rows = kind
      ? this.db.prepare(`SELECT ${COLUMNS} FROM funds_event WHERE funds_id = ? AND kind = ? ORDER BY date, event_id`).all(fundsId, kind)
      : this.db.prepare(`SELECT ${COLUMNS} FROM funds_event WHERE funds_id = ? ORDER BY date, event_id`).all(fundsId);
    return rows.map(FundsEventRepository.#toEvent);
  }

  /* one recorded event, or null when the funds have none with that id */
  findById(fundsId, eventId) {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM funds_event WHERE funds_id = ? AND event_id = ?`).get(fundsId, eventId);
    return row ? FundsEventRepository.#toEvent(row) : null;
  }

  /* saves new income or a loss and returns it with its id */
  create(fundsId, { kind, amount, date, note }) {
    const result = this.db.prepare(`
      INSERT INTO funds_event (funds_id, kind, amount, date, note) VALUES (?, ?, ?, ?, ?)
    `).run(fundsId, kind, amount, date, note);
    return this.findById(fundsId, Number(result.lastInsertRowid));
  }

  /* changes every field of a recorded event and returns it */
  update(fundsId, eventId, { kind, amount, date, note }) {
    this.db.prepare(`
      UPDATE funds_event SET kind = ?, amount = ?, date = ?, note = ? WHERE funds_id = ? AND event_id = ?
    `).run(kind, amount, date, note, fundsId, eventId);
    return this.findById(fundsId, eventId);
  }

  remove(fundsId, eventId) {
    this.db.prepare("DELETE FROM funds_event WHERE funds_id = ? AND event_id = ?").run(fundsId, eventId);
  }

  static #toEvent(row) {
    return { id: row.event_id, kind: row.kind, amount: row.amount, date: row.date, note: row.note };
  }
}

module.exports = FundsEventRepository;