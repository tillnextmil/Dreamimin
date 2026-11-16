/* ============================================================
   Step 2 controller (Your goals): loads the goals through the
   goal API client, handles add, edit and delete (with a
   confirmation), sort, search and choosing which goal to check.
   FinancialGoal and GoalList hold the rules; the server (or the
   in-memory stand-in) holds the goals; the goal view shows them.
   ============================================================ */

(function (D) {
  "use strict";

  const { format } = D;
  const view = D.views.goals;
  const SEARCH_DEBOUNCE_MS = 200;

  /* each form input: the goal field it becomes and how it is read */
  const FIELDS = {
    goalName: { key: "name", kind: "text", missing: "Give your goal a name." },
    goalAmount: { key: "targetAmount", kind: "money", missing: "Enter how much you need." },
    goalDate: { key: "targetDate", kind: "text", missing: "Choose a target date." },
    goalPriority: { key: "priority", kind: "whole" },
    goalMin: { key: "minAcceptableAmount", kind: "money", optional: true },
  };

  /* a FinancialGoal for a saved goal, or null when it can't be checked any more (its date has passed) */
  function toGoal(saved) {
    try {
      return new FinancialGoal(saved);
    } catch {
      return null;
    }
  }

  /* api is a GoalApi (HttpGoalApi or MemoryGoalApi); onChange runs whenever the goals or the
     selected goal change, so the other steps can update */
  function createGoalController({ form, api, onChange }) {
    let goals = [];             // the goals as the API last listed them (sorted and searched)
    let selected = null;        // the saved goal being checked; kept even when a search hides it
    let editingId = null;       // the goal in the form, or null when the form adds a new one
    let total = 0;              // how many goals there are, ignoring the search
    let sort = GoalList.DEFAULT_SORT, search = "", searchTimer = null, profile = null;
    let savings = 0;            // the money the user has now, counted toward each goal (0 or more)
    const touched = new Set();

    /* the form's values and an error message per invalid field */
    function readForm() {
      const values = {}, errors = {};
      for (const [name, { key, kind, missing, optional }] of Object.entries(FIELDS)) {
        const raw = form.elements[name].value.trim();
        let value = raw === "" ? null : raw;
        if (value !== null && kind === "money") value = format.parseAmount(raw);
        if (value !== null && kind === "whole") value = Number(raw);
        if (value === null && !optional) errors[name] = missing;
        values[key] = value === null && optional ? 0 : value;
      }
      const checked = FinancialGoal.validate(values);
      for (const [name, { key }] of Object.entries(FIELDS)) {
        if (!errors[name] && checked[key]) errors[name] = checked[key];
      }
      return { values, errors };
    }

    function showFormErrors(errors, everything = false) {
      for (const name of Object.keys(FIELDS)) {
        D.views.fields.showFieldError(form, name, everything || touched.has(name) ? errors[name] || "" : "");
      }
    }

    /* errors from the server (a 400 has one message per API field) go under the matching inputs */
    function showServerErrors(error) {
      if (error.errors) {
        const byKey = Object.fromEntries(Object.entries(FIELDS).map(([name, { key }]) => [key, name]));
        const errors = {};
        for (const [key, message] of Object.entries(error.errors)) if (byKey[key]) errors[byKey[key]] = message;
        showFormErrors(errors, true);
      }
      view.showFormError(error.errors ? "" : error.message);
    }

    /* asks the API for the goals in the chosen order, keeps the selection, then updates the page */
    async function load() {
      try {
        const [listed, all] = await Promise.all([api.list({ sort, search }), search ? api.list() : null]);
        goals = listed;
        total = (all || listed).length;
        const everything = all || listed;
        selected = everything.find((g) => selected && String(g.id) === String(selected.id)) || everything[0] || null;
        view.showListError("");
      } catch (error) {
        view.showListError(error.message);
      }
      onChange();
    }

    async function save() {
      const { values, errors } = readForm();
      if (Object.keys(errors).length) {
        Object.keys(FIELDS).forEach((name) => touched.add(name));
        showFormErrors(errors, true);
        form.elements[Object.keys(errors)[0]].focus();
        return;
      }
      try {
        const saved = editingId === null ? await api.create(values) : await api.update(editingId, values);
        selected = saved;
        cancel();
        await load();
      } catch (error) {
        showServerErrors(error);
      }
    }

    function edit(id) {
      const goal = goals.find((g) => String(g.id) === String(id));
      if (!goal) return;
      editingId = goal.id;
      touched.clear();
      showFormErrors({});
      view.showFormError("");
      view.fillForm(goal);
      view.showFormMode("edit", goal.name);
      refresh(profile, savings);
      view.focusForm();
    }

    /* back to adding a new goal, with an empty form */
    function cancel() {
      editingId = null;
      touched.clear();
      view.clearForm();
      showFormErrors({});
      view.showFormError("");
      view.showFormMode("add");
      refresh(profile, savings);
    }

    async function remove(id) {
      const goal = goals.find((g) => String(g.id) === String(id));
      if (!goal || !(await view.confirmDelete(goal.name))) return;
      try {
        await api.remove(goal.id);
        if (String(editingId) === String(goal.id)) cancel();
        if (selected && String(selected.id) === String(goal.id)) selected = null;
        await load();
      } catch (error) {
        view.showListError(error.message);
      }
    }

    function select(id) {
      selected = goals.find((g) => String(g.id) === String(id)) || selected;
      onChange();
    }

    /* One row per listed goal for the view. With a profile, each row says whether the goal is on
       track with the money the user has now and the current monthly cash flow; a goal whose date
       has passed says so instead. */
    function rows() {
      return goals.map((saved) => {
        const goal = toGoal(saved);
        let status = null;
        if (!goal) status = { tone: "short", text: "Date has passed" };
        else if (profile) status = goal.isOnTrack(profile.monthlyCashFlow, new Date(), savings)
          ? { tone: "ok", text: "On track" } : { tone: "short", text: "Not on track yet" };
        return {
          ...saved,
          date: FinancialGoal.parseDate(saved.targetDate),
          monthlyNeeded: goal ? Math.ceil(goal.monthlySavingsRequired(new Date(), savings)) : null,
          status,
        };
      });
    }

    /* shows the list, the form state and the goal check for `currentProfile` (a FinancialProfile
       or null) and `currentSaved`, the money the user has now (the same starting money as the
       chances in step 3); returns the selected goal as a FinancialGoal, or null */
    function refresh(currentProfile, currentSaved = 0) {
      profile = currentProfile;
      savings = Math.max(0, currentSaved);   // a negative net worth counts as 0, as in step 3
      const goal = selected ? toGoal(selected) : null;
      const emptyText = search ? `No goals match "${search}".` : "No goals yet. Add your first one below.";
      view.showList(rows(), { selectedId: selected && selected.id, emptyText });
      view.showCount(total, GoalList.MAX_GOALS);
      view.showTools(total > 0 || search !== "");
      view.showAddAllowed(editingId !== null || GoalList.canAdd(total), `${GoalList.TOO_MANY} Delete one to add another.`);

      let checkText = "Add a goal to see if you can reach it.";
      if (selected && !goal) checkText = `${selected.name}'s date has passed. Edit it to pick a later date.`;
      else if (goal && !profile) checkText = "Now add your monthly income and spending to check this goal.";
      view.showGoalCheck(goal, profile && goal ? goal.check(profile.monthlyCashFlow, { saved: savings }) : null, checkText);
      return goal;
    }

    /* Start over: deletes every goal and empties the form, search and sort */
    async function removeAll() {
      try {
        const all = await api.list();
        for (const goal of all) await api.remove(goal.id);
      } catch (error) {
        view.showListError(error.message);
      }
      sort = GoalList.DEFAULT_SORT;
      search = "";
      form.elements.goalSort.value = sort;
      form.elements.goalSearch.value = "";
      selected = null;
      cancel();
      await load();
    }

    /* true while the form has something typed that Start over would lose */
    const hasTyped = () => ["goalName", "goalAmount", "goalDate", "goalMin"].some((name) => form.elements[name].value.trim() !== "");

    /* ---------- events ---------- */

    document.getElementById("goal-save").addEventListener("click", save);
    document.getElementById("goal-cancel").addEventListener("click", cancel);

    // Enter in a goal field saves, as it would in a form of its own
    document.getElementById("goal-form").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.matches("input")) {
        event.preventDefault();
        save();
      }
    });

    // errors show once a field has been left, and then update while typing
    document.getElementById("goal-form").addEventListener("input", (event) => {
      if (event.target.name in FIELDS && touched.has(event.target.name)) showFormErrors(readForm().errors);
    });
    document.getElementById("goal-form").addEventListener("focusout", (event) => {
      const input = event.target;
      if (!(input.name in FIELDS)) return;
      touched.add(input.name);
      if (FIELDS[input.name].kind === "money") {
        const value = format.parseAmount(input.value);
        if (value !== null && !Number.isNaN(value)) input.value = format.plain(value);
      }
      showFormErrors(readForm().errors);
    });

    document.getElementById("goal-list").addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      const item = event.target.closest("[data-goal-id]");
      if (!target || !item) return;
      const id = item.dataset.goalId;
      if (target.dataset.action === "select") select(id);
      else if (target.dataset.action === "edit") edit(id);
      else if (target.dataset.action === "delete") remove(id);
    });

    form.elements.goalSort.addEventListener("change", () => {
      sort = form.elements.goalSort.value;
      load();
    });
    form.elements.goalSearch.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        search = form.elements.goalSearch.value.trim();
        load();
      }, SEARCH_DEBOUNCE_MS);
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    view.setMinDate(format.isoDate(tomorrow));

    return { load, refresh, removeAll, hasTyped, count: () => total };
  }

  D.controllers = D.controllers || {};
  D.controllers.goals = createGoalController;
})(window.Dreamimin);
