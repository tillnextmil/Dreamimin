/* ============================================================
   Step 2 view (Your goals): the list of goals, the add/edit
   form, and the goal check for the selected goal. Display only:
   the goal controller decides what goes in each row and handles
   every click (rows carry data-goal-id and data-action).
   ============================================================ */

(function (D) {
  "use strict";

  const { format } = D;
  const $ = (id) => document.getElementById(id);

  const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
  const ICON_SHORT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>';

  const button = (action, text, label, className = "link-btn") => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = className;
    el.dataset.action = action;
    el.textContent = text;
    if (label) el.setAttribute("aria-label", label);
    return el;
  };

  /* Rows: { id, name, targetAmount, date (a Date), priority, minAcceptableAmount, monthlyNeeded,
     status: { tone: "ok" | "short", text } or null }. emptyText shows when there are no rows. */
  function showList(rows, { selectedId, emptyText }) {
    const list = $("goal-list");
    list.replaceChildren();
    $("goal-list-empty").hidden = rows.length > 0;
    $("goal-list-empty-text").textContent = emptyText;

    for (const row of rows) {
      const selected = String(row.id) === String(selectedId);
      const item = document.createElement("li");
      item.className = "goal-item" + (selected ? " is-selected" : "");
      item.dataset.goalId = row.id;

      // the main area selects the goal for the goal check and step 3
      const select = button("select", "", `Check ${row.name}`, "goal-item__select");
      select.setAttribute("aria-pressed", String(selected));
      const name = document.createElement("span");
      name.className = "goal-item__name";
      name.textContent = row.name;
      const meta = document.createElement("span");
      meta.className = "goal-item__meta";
      const parts = [`${format.money(row.targetAmount)} by ${format.longDate(row.date)}`, `Priority ${row.priority} of 5`];
      if (row.minAcceptableAmount > 0) parts.push(`would accept ${format.money(row.minAcceptableAmount)}`);
      // $0 a month means the savings cover it; say so unless spending more than earning eats into them
      if (row.monthlyNeeded === 0) {
        if (!row.status || row.status.tone === "ok") parts.push("covered by your savings");
      } else if (row.monthlyNeeded !== null) {
        parts.push(`${format.money(row.monthlyNeeded)} a month`);
      }
      meta.textContent = parts.join(" · ");
      select.append(name, meta);

      const side = document.createElement("div");
      side.className = "goal-item__side";
      if (row.status) {
        const status = document.createElement("span");
        status.className = "status status--" + row.status.tone;
        status.innerHTML = (row.status.tone === "ok" ? ICON_OK : ICON_SHORT) + "<span></span>";
        status.lastChild.textContent = row.status.text;
        side.append(status);
      }
      const actions = document.createElement("div");
      actions.className = "goal-item__actions";
      actions.append(button("edit", "Edit", `Edit ${row.name}`), button("delete", "Delete", `Delete ${row.name}`, "link-btn link-btn--danger"));
      side.append(actions);

      item.append(select, side);
      list.appendChild(item);
    }
  }

  const showCount = (count, max) => { $("goal-count").textContent = count ? `${count} of ${max}` : ""; };

  /* the toolbar is shown while there are goals or a search is typed, so a search can be cleared */
  const showTools = (visible) => { $("goal-tools").hidden = !visible; };
  const showListError = (message) => { $("goal-list-error").textContent = message; };
  const showFormError = (message) => { $("goal-form-error").textContent = message; };

  /* "add" or "edit" (with the goal's name); the form's title and buttons follow */
  function showFormMode(mode, name = "") {
    $("goal-form-title").textContent = mode === "edit" ? `Edit ${name}` : "Add a goal";
    $("goal-save").textContent = mode === "edit" ? "Save changes" : "Add goal";
    $("goal-cancel").hidden = mode !== "edit";
    $("goal-form").classList.toggle("is-editing", mode === "edit");
  }

  /* while the list is full, adding is turned off and the reason shows under the button */
  function showAddAllowed(allowed, reason) {
    $("goal-save").disabled = !allowed;
    $("goal-limit").textContent = allowed ? "" : reason;
  }

  /* values: { name, targetAmount, targetDate, priority, minAcceptableAmount } */
  function fillForm(values) {
    $("goalName").value = values.name;
    $("goalAmount").value = format.plain(values.targetAmount);
    $("goalDate").value = values.targetDate;
    $("goalPriority").value = String(values.priority);
    $("goalMin").value = values.minAcceptableAmount > 0 ? format.plain(values.minAcceptableAmount) : "";
  }

  function clearForm() {
    for (const id of ["goalName", "goalAmount", "goalDate", "goalMin"]) $(id).value = "";
    $("goalPriority").value = "3";
  }

  const focusForm = () => $("goalName").focus();

  /* the earliest date the picker allows: "YYYY-MM-DD" for tomorrow */
  const setMinDate = (tomorrow) => { $("goalDate").min = tomorrow; };

  /* fills in and opens the delete dialog; resolves to true when the user confirms */
  function confirmDelete(name) {
    $("delete-goal-title").textContent = `Delete ${name}?`;
    $("delete-goal-text").textContent = "This removes the goal and its results. It can't be undone.";
    return D.views.fields.confirm($("delete-goal-dialog"));
  }

  /* The goal check card for the selected goal. goal is a FinancialGoal and check is what
     goal.check() worked out, or null; emptyText says what's missing when there's no check. */
  function showGoalCheck(goal, check, emptyText) {
    $("goal-empty").hidden = Boolean(check);
    $("goal-result").hidden = !check;
    if (!check) {
      $("goal-empty-text").textContent = emptyText;
      return;
    }

    const { saved, monthlySaving: have, monthlyNeeded, onTrack, monthsLeft, monthsToReach, coveredBySavings, monthlyGap } = check;
    const target = format.money(goal.targetAmount);
    const date = FinancialGoal.parseDate(goal.targetDate);
    const coverage = Math.round(check.coverage * 100);
    document.querySelector(".goal-card").classList.toggle("is-short", !onTrack);

    $("goal-name").textContent = goal.name;
    $("goal-target").textContent = `${target} by ${format.longDate(date)}`;
    $("goal-status").className = "status " + (onTrack ? "status--ok" : "status--short");
    $("goal-status").innerHTML = (onTrack ? ICON_OK : ICON_SHORT) + `<span>${onTrack ? "On track" : "Not on track yet"}</span>`;

    $("goal-needed").textContent = format.money(Math.ceil(monthlyNeeded));
    $("goal-have").textContent = format.signed(have);

    $("goal-fill").style.width = coverage + "%";
    $("goal-meter").setAttribute("aria-label", `What's left each month covers ${coverage}% of what this goal needs`);
    if (coveredBySavings && onTrack) {
      $("goal-coverage").textContent = `The ${format.money(saved)} you have for goals already covers this goal.`;
    } else if (coveredBySavings) {
      $("goal-coverage").textContent = `Spending more than you earn takes ${format.money(-have)} a month out of the ${format.money(saved)} you have for goals.`;
    } else {
      $("goal-coverage").textContent = `What's left each month covers ${coverage}% of what this goal needs` +
        (saved > 0 ? `, after the ${format.money(saved)} you have for goals.` : ".");
    }

    const reachBy = (n) => format.monthYear(new Date(new Date().getFullYear(), new Date().getMonth() + n, 1));
    const withSavings = saved > 0 ? `the ${format.money(saved)} you have for goals and ` : "";
    let advice;
    if (onTrack && coveredBySavings) {
      advice = `The ${format.money(saved)} you have for goals is enough for ${target}. Keep it set aside until ${format.monthYear(date)}.`;
    } else if (onTrack) {
      advice = `With ${withSavings}${format.money(have)} a month toward it, you'd reach ${target} in ${format.plural(monthsToReach, "month")}, around ${reachBy(monthsToReach)}.`;
    } else if (coveredBySavings) {
      advice = `The ${format.money(saved)} you have for goals covers this goal today, but spending more than you earn would use it up before ${format.monthYear(date)}. Spending less or earning more is the first step.`;
    } else if (have <= 0) {
      advice = saved > 0
        ? `Nothing is left over each month, and the ${format.money(saved)} you have for goals covers only part of ${target}. Spending less or earning more is the first step.`
        : "Nothing is left over each month right now, so there's no money to put toward this goal. Spending less or earning more is the first step.";
    } else {
      advice = `You'd need ${format.money(Math.ceil(monthlyGap))} more a month to make it in ${format.plural(monthsLeft, "month")}. At your current pace you'd get there around ${reachBy(monthsToReach)} instead.`;
    }
    $("goal-advice").textContent = advice;
  }

  D.views.goals = {
    showList, showCount, showTools, showListError, showFormError, showFormMode, showAddAllowed,
    fillForm, clearForm, focusForm, setMinDate, confirmDelete, showGoalCheck,
  };
})(window.Dreamimin);
