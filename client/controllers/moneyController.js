/* ============================================================
   Step 1 controller (Your money): reads the income, spending,
   net worth and available funds fields, builds a
   FinancialProfile and keeps the AvailableFunds, and handles
   recording and removing spending. The rules live in the domain
   classes; this file only passes input to them and tells the
   money view what to show.
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
  };
  const CLASSES = { profile: FinancialProfile, funds: AvailableFunds };

  /* onChange runs after anything on this step changes; onSpendingChanged runs just before, when
     spending was recorded or removed (so the chance before the change can be remembered) */
  function createMoneyController({ form, onChange, onSpendingChanged }) {
    const touched = new Set();
    /* the user's AvailableFunds while the field has a valid amount, otherwise null; kept between
       updates so spending recorded against it isn't lost */
    let funds = null;

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
      view.showSpending(funds, fundsInput.valid);
      const errors = { ...profileInput.errors, ...fundsInput.errors };
      // errors only show once a field has been left, so nothing turns red while typing
      for (const name of Object.keys(FIELDS)) {
        D.views.fields.showFieldError(form, name, touched.has(name) ? errors[name] || "" : "");
      }
      const profile = profileInput.valid ? new FinancialProfile(profileInput.values) : null;
      view.showMoney(profile, funds);
      return { profile, funds, fundsReady: fundsInput.valid };
    }

    /* builds an Expense from the spending inputs and records it; shows the error message if it can't */
    function recordSpending() {
      try {
        const expense = new Expense({
          amount: format.parseAmount(form.elements.spendAmount.value),
          date: form.elements.spendDate.value,
          note: form.elements.spendNote.value,
        });
        funds.recordSpending(expense);
      } catch (error) {
        view.showSpendingError(error.message);
        return;
      }
      view.showSpendingError("");
      view.clearSpendingInputs();
      onSpendingChanged();
      onChange();
    }

    function removeSpending(expenseId) {
      funds.removeSpending(expenseId);
      onSpendingChanged();
      onChange();
    }

    /* true when something has been typed or spending recorded, so Start over would lose it;
       the spending date is left out because it is filled in with today */
    function hasAnswers() {
      const typed = [...Object.keys(FIELDS), "spendAmount", "spendNote"]
        .some((name) => form.elements[name].value.trim() !== "");
      return typed || Boolean(funds && funds.expenses.length > 0);
    }

    /* empties this step: the fields, the spending and the messages */
    function reset() {
      for (const name of [...Object.keys(FIELDS), "spendAmount", "spendNote"]) form.elements[name].value = "";
      touched.clear();
      funds = null;
      view.showSpendingError("");
      view.showSpendingImpact("");
      view.setSpendingDate(format.isoDate(new Date()));
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

    document.getElementById("spending-add").addEventListener("click", recordSpending);
    document.getElementById("spending-list").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-expense-id]");
      if (remove) removeSpending(remove.dataset.expenseId);
    });

    view.setSpendingDate(format.isoDate(new Date()));
    return { refresh, hasAnswers, reset };
  }

  D.controllers = D.controllers || {};
  D.controllers.money = createMoneyController;
})(window.Dreamimin);
