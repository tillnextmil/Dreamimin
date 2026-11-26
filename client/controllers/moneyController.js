/* ============================================================
   Step 1 controller (Your money): reads the income, spending,
   net worth, available funds and emergency fund fields, builds a
   FinancialProfile and keeps the AvailableFunds, and handles
   recording spending (with its category), editing it, removing
   it after asking, and filtering the list, and recording and
   removing income and losses. With a server, it loads what was
   saved when the page opens and saves each change through the
   money API client, so step 1 is still there after a reload.
   The rules live in the domain classes; this file only passes
   input to them and tells the money view what to show.
   ============================================================ */

(function (D) {
  "use strict";

  const { format } = D;
  const view = D.views.money;

  /* each input: which class it feeds, the property it becomes, and how it is read */
  const FIELDS = {
    income: { group: "profile", key: "income", missing: "Enter your monthly income." },
    expenses: { group: "profile", key: "expenses", missing: "Enter your monthly spending." },
    netWorth: { group: "profile", key: "netWorth", optional: true },
    availableFunds: { group: "funds", key: "balance", optional: true },
    emergencyFund: { group: "profile", key: "emergencyFund", optional: true },
  };
  const CLASSES = { profile: FinancialProfile, funds: AvailableFunds };
  const DEFAULT_CATEGORY = "other";   // the category an Expense gets when none is chosen
  const SAVE_DELAY_MS = 500;          // waits this long after the last keystroke before saving

  /* api is a MoneyApi (HttpMoneyApi), or null when the page is opened straight from disk and step 1
     stays in memory. onChange runs after anything on this step changes; onSpendingChanged runs just
     before, when spending was recorded or removed (so the chance before the change can be remembered) */
  function createMoneyController({ form, api = null, onChange, onSpendingChanged }) {
    const touched = new Set();
    /* the user's AvailableFunds while the field has a valid amount, otherwise null; kept between
       updates so spending recorded against it isn't lost */
    let funds = null;
    /* what the server has, so each change is sent once: the profile's values as JSON (null before the
       first save) and the entered funds (null when the server has none) */
    let savedProfile = null, savedEntered = null;
    let pendingEntered;                      // the entered funds waiting to be saved (undefined: nothing)
    let profileTimer = null, fundsTimer = null;
    let fundsSaving = Promise.resolve();     // funds saves run one after another, in order
    let loaded = !api;                       // nothing is saved until what's saved has been loaded
    let editingId = null;                    // the spending in the form, or null when it records new spending

    /* values and error messages for one class's inputs; values are null where something is missing */
    function readGroup(group) {
      const names = Object.keys(FIELDS).filter((name) => FIELDS[name].group === group);
      const values = {}, errors = {};
      let started = false;
      for (const name of names) {
        const { key, missing, optional } = FIELDS[name];
        const value = format.parseAmount(form.elements[name].value);
        if (value !== null) started = true;
        if (value === null && !optional) errors[name] = missing;
        values[key] = value === null && optional ? 0 : value;
      }
      const checked = CLASSES[group].validate(values);
      for (const name of names) {
        if (!errors[name] && checked[FIELDS[name].key]) errors[name] = checked[FIELDS[name].key];
      }
      return { values, errors, started, valid: Object.keys(errors).length === 0 };
    }

    /* Keeps `funds` in step with the Available funds field. The field is what the user has before
       any recorded spending; AvailableFunds.setEnteredAmount takes the spending off. */
    function readFunds(input) {
      if (!input.started) {
        funds = null;
        return;
      }
      if (!input.valid) return;
      const entered = input.values.balance;
      if (!funds) {
        funds = new AvailableFunds({ balance: entered });
        return;
      }
      try {
        funds.setEnteredAmount(entered);
      } catch (error) {
        input.errors.availableFunds = error.message;
        input.valid = false;
      }
    }

    /* reads the fields, shows the results and errors, and returns what the other steps need */
    function refresh() {
      const profileInput = readGroup("profile");
      const fundsInput = readGroup("funds");
      readFunds(fundsInput);
      if (editingId !== null && !(funds && funds.expenses.some((e) => e.id === editingId))) stopEditing();
      view.showSpending(funds, fundsInput.valid, funds ? funds.spendingByCategory(Expense.CATEGORIES) : [], filtered());
      view.showEvents(funds, fundsInput.valid);
      const errors = { ...profileInput.errors, ...fundsInput.errors };
      // errors only show once a field has been left, so nothing turns red while typing
      for (const name of Object.keys(FIELDS)) {
        D.views.fields.showFieldError(form, name, touched.has(name) ? errors[name] || "" : "");
      }
      const profile = profileInput.valid ? new FinancialProfile(profileInput.values) : null;
      view.showMoney(profile, funds);
      if (api && loaded) scheduleSaves(profileInput, fundsInput);
      return { profile, funds, fundsReady: fundsInput.valid };
    }

    /* the spending the filters keep, or the filters' message (AvailableFunds.findSpending has the rules) */
    function filtered() {
      if (!funds) return { editingId };
      try {
        return { shown: funds.findSpending(view.readFilters()), editingId };
      } catch (error) {
        return { shown: [], filterError: error.message, editingId };
      }
    }

    /* ---------- saving to the server ---------- */

    /* Saves a valid profile and the entered funds a moment after they change. Funds that are emptied
       are cleared on the server too, as the page drops them. Invalid input isn't saved: what was saved
       last stays until the input is valid again. */
    function scheduleSaves(profileInput, fundsInput) {
      if (profileInput.valid) {
        const values = { ...profileInput.values };
        const json = JSON.stringify(values);
        clearTimeout(profileTimer);
        if (json !== savedProfile) profileTimer = setTimeout(() => saveProfile(values, json), SAVE_DELAY_MS);
      }
      const entered = !fundsInput.started ? null : fundsInput.valid ? fundsInput.values.balance : undefined;
      if (entered === undefined) return;
      pendingEntered = entered;
      clearTimeout(fundsTimer);
      if (entered !== savedEntered) fundsTimer = setTimeout(saveFunds, SAVE_DELAY_MS);
    }

    async function saveProfile(values, json) {
      try {
        await api.saveProfile(values);
        savedProfile = json;
        view.showSaveStatus("Your money is saved.");
      } catch (error) {
        view.showSaveStatus(`Your money couldn't be saved. ${error.message}`, true);
      }
    }

    /* saves the entered funds now if they changed; resolves once every funds save so far is done */
    function saveFunds() {
      clearTimeout(fundsTimer);
      const entered = pendingEntered;
      pendingEntered = undefined;
      if (entered === undefined) return fundsSaving;
      fundsSaving = fundsSaving.then(async () => {
        if (entered === savedEntered) return;
        try {
          if (entered === null) await api.clearFunds();
          else await api.saveFunds(entered);
          savedEntered = entered;
          view.showSaveStatus("Your money is saved.");
        } catch (error) {
          view.showSaveStatus(`Your available funds couldn't be saved. ${error.message}`, true);
        }
      });
      return fundsSaving;
    }

    /* puts a saved amount back in a field, e.g. 4500 -> "4,500"; empty for null (and for $0 in optional fields) */
    function fill(name, amount, { blankZero = false } = {}) {
      form.elements[name].value = amount === null || (blankZero && amount === 0) ? "" : format.plain(amount);
    }

    /* With a server, fills step 1 with what was saved and rebuilds the AvailableFunds from the saved
       funds, income, losses and spending, then updates the page. */
    async function load() {
      if (!api) return;
      try {
        const [profile, saved, expenses, events] = await Promise.all([
          api.getProfile(), api.getFunds(), api.listExpenses(), api.listEvents(),
        ]);
        fill("income", profile.income);
        fill("expenses", profile.expenses);
        fill("netWorth", profile.netWorth, { blankZero: true });
        fill("emergencyFund", profile.emergencyFund, { blankZero: true });
        fill("availableFunds", saved.entered);
        funds = null;
        if (saved.entered !== null) {
          // income first, so the order the rest was recorded in never matters (as on the server)
          funds = new AvailableFunds({ balance: saved.entered });
          for (const event of events.filter((e) => e.kind === "income")) funds.recordEvent(event);
          for (const event of events.filter((e) => e.kind === "loss")) funds.recordEvent(event);
          for (const expense of expenses) funds.recordSpending(expense);
        }
        const { income, expenses: spending, netWorth, emergencyFund } = profile;
        savedProfile = income === null ? null : JSON.stringify({ income, expenses: spending, netWorth, emergencyFund });
        savedEntered = saved.entered;
      } catch (error) {
        view.showSaveStatus(`Your saved money couldn't be loaded. ${error.message}`, true);
      }
      loaded = true;
      onChange();
    }

    /* Builds an Expense from the spending inputs and records it, or saves the edit when the form holds
       recorded spending (on the server first, when there is one, so the list has the server's id and
       values); shows the error message if it can't. */
    async function saveSpending() {
      try {
        const expense = new Expense({
          id: editingId ?? undefined,
          amount: format.parseAmount(form.elements.spendAmount.value),
          date: form.elements.spendDate.value,
          note: form.elements.spendNote.value,
          category: form.elements.spendCategory.value,
        });
        if (editingId !== null) {
          funds.editSpending(editingId, api ? await api.updateExpense(editingId, expense) : expense);
        } else if (api) {
          await saveFunds();   // the server needs the funds before it can record spending against them
          funds.recordSpending(await api.addExpense(expense));
        } else {
          funds.recordSpending(expense);
        }
      } catch (error) {
        view.showSpendingError(error.message);
        return;
      }
      view.showSpendingError("");
      if (editingId !== null) stopEditing();
      else view.clearSpendingInputs();
      onSpendingChanged();
      onChange();
    }

    /* puts recorded spending in the form to edit it */
    function startEditing(expenseId) {
      const expense = funds && funds.expenses.find((e) => String(e.id) === String(expenseId));
      if (!expense) return;
      editingId = expense.id;
      view.showSpendingError("");
      view.fillSpendingInputs(expense);
      view.setSpendingMode(true);
      onChange();
    }

    /* back to recording new spending: empties the form (keeping the category) and the date is today */
    function stopEditing() {
      editingId = null;
      view.clearSpendingInputs();
      view.setSpendingDate(format.isoDate(new Date()));
      view.setSpendingMode(false);
    }

    /* asks first (it names the spending), then removes it and puts its amount back in the funds */
    async function removeSpending(expenseId) {
      const index = funds ? funds.expenses.findIndex((expense) => String(expense.id) === String(expenseId)) : -1;
      if (index === -1) return;
      const expense = funds.expenses[index];
      if (!(await view.confirmRemoveSpending(expense))) return;
      if (!funds || !funds.expenses.includes(expense)) return;   // already gone while the dialog was open
      if (api) {
        try {
          await api.removeExpense(expense.id);
        } catch (error) {
          view.showSpendingError(error.message);
          return;
        }
      }
      funds.removeSpending(expense.id);
      if (editingId === expense.id) stopEditing();
      onSpendingChanged();
      onChange();
      view.focusAfterRemove(index);
    }

    /* ---------- income and losses ---------- */

    /* builds a FundsEvent from the inputs and records it (on the server first, when there is one, so it
       gets the server's id); income raises the funds and a loss lowers them */
    async function recordEvent() {
      try {
        const event = new FundsEvent({
          kind: form.elements.eventKind.value,
          amount: format.parseAmount(form.elements.eventAmount.value),
          date: form.elements.eventDate.value,
          note: form.elements.eventNote.value,
        });
        if (api) {
          await saveFunds();   // the server needs the funds before it can record against them
          funds.recordEvent(await api.addEvent(event));
        } else {
          funds.recordEvent(event);
        }
      } catch (error) {
        view.showEventError(error.message);
        return;
      }
      view.showEventError("");
      view.clearEventInputs(format.isoDate(new Date()));
      onSpendingChanged();
      onChange();
    }

    /* asks first (it names the income or loss), then removes it and undoes its change to the funds */
    async function removeEvent(eventId) {
      const event = funds && funds.events.find((e) => String(e.id) === String(eventId));
      if (!event || !(await view.confirmRemoveEvent(event))) return;
      if (!funds || !funds.events.includes(event)) return;   // already gone while the dialog was open
      try {
        if (api) await api.removeEvent(event.id);
        funds.removeEvent(event.id);   // removing income that has been spent is refused, with its message
      } catch (error) {
        view.showEventError(error.message);
        return;
      }
      view.showEventError("");
      onSpendingChanged();
      onChange();
    }

    /* true when something has been typed or spending, income or losses recorded, so Start over would
       lose it; the dates are left out because they are filled in with today */
    function hasAnswers() {
      const typed = [...Object.keys(FIELDS), "spendAmount", "spendNote", "eventAmount", "eventNote"]
        .some((name) => form.elements[name].value.trim() !== "");
      return typed || Boolean(funds && (funds.expenses.length > 0 || funds.events.length > 0));
    }

    /* empties this step: the fields, the spending and the messages, and with a server, what was saved */
    async function reset() {
      for (const name of [...Object.keys(FIELDS), "spendAmount", "spendNote"]) form.elements[name].value = "";
      view.clearEventInputs(format.isoDate(new Date()));
      view.showEventError("");
      touched.clear();
      funds = null;
      if (editingId !== null) stopEditing();
      view.clearFilters();
      view.showSpendingError("");
      view.showSpendingImpact("");
      view.showSaveStatus("");
      view.setSpendingDate(format.isoDate(new Date()));
      view.showCategories(Expense.CATEGORIES, DEFAULT_CATEGORY);
      if (!api) return;
      clearTimeout(profileTimer);
      clearTimeout(fundsTimer);
      pendingEntered = undefined;
      try {
        await fundsSaving;
        await Promise.all([api.clearFunds(), api.resetProfile()]);
        savedProfile = null;
        savedEntered = null;
      } catch (error) {
        view.showSaveStatus(`Your saved money couldn't be cleared. ${error.message}`, true);
      }
    }

    const isMoneyField = (target) => Boolean(target && target.name in FIELDS);
    form.addEventListener("input", (event) => { if (isMoneyField(event.target)) onChange(); });
    form.addEventListener("change", (event) => { if (isMoneyField(event.target)) onChange(); });

    /* on leaving a field: mark it touched and tidy the amount, e.g. 4500 -> 4,500 */
    form.addEventListener("focusout", (event) => {
      const input = event.target;
      if (!isMoneyField(input)) return;
      touched.add(input.name);
      const value = format.parseAmount(input.value);
      if (value !== null && !Number.isNaN(value)) input.value = format.plain(value);
      onChange();
    });

    document.getElementById("spending-add").addEventListener("click", saveSpending);
    document.getElementById("spending-cancel").addEventListener("click", () => {
      stopEditing();
      view.showSpendingError("");
      onChange();
    });
    document.getElementById("spending-list").addEventListener("click", (event) => {
      const edit = event.target.closest("[data-edit-id]");
      if (edit) return startEditing(edit.dataset.editId);
      const remove = event.target.closest("[data-expense-id]");
      if (remove) removeSpending(remove.dataset.expenseId);
    });
    document.getElementById("event-add").addEventListener("click", recordEvent);
    document.getElementById("event-list").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-event-id]");
      if (remove) removeEvent(remove.dataset.eventId);
    });
    // the filters only change which spending is listed
    document.getElementById("spending-filters").addEventListener("input", () => onChange());
    document.getElementById("spending-filters").addEventListener("change", () => onChange());

    view.setSpendingDate(format.isoDate(new Date()));
    view.clearEventInputs(format.isoDate(new Date()));
    view.showCategories(Expense.CATEGORIES, DEFAULT_CATEGORY);
    return { load, refresh, hasAnswers, reset };
  }

  D.controllers = D.controllers || {};
  D.controllers.money = createMoneyController;
})(window.Dreamimin);