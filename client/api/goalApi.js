/* ============================================================
   Goal API client: the only part of the page that talks to the
   server about goals (SPECIFICATIONS.md, item 12). Controllers
   call it; views never do.

   HttpGoalApi sends the real requests. MemoryGoalApi keeps the
   goals in memory and follows the same contract (shapes, status
   codes and messages), so the page works before the server has
   every route, and when it is opened straight from disk. Both
   return promises and throw an ApiError for any failed request.
   ============================================================ */

(function (global) {
  "use strict";

  const FinancialGoal = global.FinancialGoal || require("../../src/financialGoal");
  const GoalList = global.GoalList || require("../../src/goalList");
  const { ApiError, sendJson } = (global.Dreamimin && global.Dreamimin.ApiRequest) || require("./request");

  /* the fields a goal is created or edited with; everything else in `goal` is left out */
  const editable = ({ name, targetAmount, targetDate, priority, minAcceptableAmount }) =>
    ({ name, targetAmount, targetDate, priority, minAcceptableAmount });

  class HttpGoalApi {
    /* fetch is passed in so tests can replace it; base is where the API lives */
    constructor({ fetch = (...args) => global.fetch(...args), base = "/api" } = {}) {
      this.fetch = fetch;
      this.base = base;
    }

    list({ sort, search } = {}) {
      const query = new URLSearchParams();
      if (sort) query.set("sort", sort);
      if (search) query.set("search", search);
      const text = query.toString();
      return this.#send("GET", "/goals" + (text ? "?" + text : ""));
    }

    get(id) { return this.#send("GET", `/goals/${encodeURIComponent(id)}`); }
    create(goal) { return this.#send("POST", "/goals", editable(goal)); }
    update(id, goal) { return this.#send("PUT", `/goals/${encodeURIComponent(id)}`, editable(goal)); }
    remove(id) { return this.#send("DELETE", `/goals/${encodeURIComponent(id)}`); }

    #send(method, path, body) {
      return sendJson(this.fetch, this.base + path, method, body);
    }
  }

  class MemoryGoalApi {
    #goals = [];
    #nextId = 1;

    /* now gives "today" and the creation time, so tests can fix the clock */
    constructor({ now = () => new Date() } = {}) {
      this.now = now;
    }

    async list({ sort = GoalList.DEFAULT_SORT, search = "" } = {}) {
      const problem = GoalList.checkSort(sort);
      if (problem) throw new ApiError(400, { errors: { sort: problem } });
      return GoalList.arrange(this.#goals, { sort, search }).map(copy);
    }

    async get(id) {
      return copy(this.#find(id));
    }

    async create(goal) {
      const fields = this.#checked(goal);
      if (!GoalList.canAdd(this.#goals.length)) throw new ApiError(409, { error: GoalList.TOO_MANY });
      const saved = { id: this.#nextId++, ...fields, createdAt: this.now().toISOString() };
      this.#goals.push(saved);
      return copy(saved);
    }

    /* every field is sent, as with PUT; the id and createdAt stay the same */
    async update(id, goal) {
      const current = this.#find(id);
      Object.assign(current, this.#checked(goal));
      return copy(current);
    }

    async remove(id) {
      const current = this.#find(id);
      this.#goals.splice(this.#goals.indexOf(current), 1);
      return null;
    }

    #find(id) {
      const goal = this.#goals.find((g) => String(g.id) === String(id));
      if (!goal) throw new ApiError(404, { error: "No goal with that id." });
      return goal;
    }

    /* the fields to save, with the contract's defaults; a 400 with a message per invalid field otherwise */
    #checked(goal) {
      const fields = editable(goal);
      if (fields.priority === undefined) fields.priority = FinancialGoal.DEFAULT_PRIORITY;
      if (fields.minAcceptableAmount === undefined) fields.minAcceptableAmount = 0;
      const errors = FinancialGoal.validate({ ...fields, asOf: this.now() });
      if (Object.keys(errors).length) throw new ApiError(400, { errors });
      return { ...fields, name: fields.name.trim() };
    }
  }

  const copy = (goal) => ({ ...goal });

  const GoalApi = { HttpGoalApi, MemoryGoalApi, ApiError };
  if (typeof module !== "undefined" && module.exports) module.exports = GoalApi;
  else (global.Dreamimin = global.Dreamimin || {}).GoalApi = GoalApi;
})(typeof window !== "undefined" ? window : globalThis);
