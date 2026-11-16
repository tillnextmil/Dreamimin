/* ============================================================
   Step 1 view (Your money): the monthly money results and the
   list of recorded spending. Display only: it reads from the
   FinancialProfile and AvailableFunds it is given and never
   changes them or calls the server.
   ============================================================ */

(function (D) {
  "use strict";

  const { format } = D;
  const $ = (id) => document.getElementById(id);

  /* profile is a FinancialProfile or null; funds is the AvailableFunds or null */
  function showMoney(profile, funds) {
    $("money-empty").hidden = Boolean(profile);
    $("money-result").hidden = !profile;
    if (!profile) return;

    const result = $("money-result");
    const flow = profile.monthlyCashFlow;
    const ratePct = Math.round(profile.savingsRate * 100);
    result.classList.toggle("is-positive", flow > 0);
    result.classList.toggle("is-negative", flow < 0);

    $("cashflow-value").textContent = (flow > 0 ? "+" : "") + format.signed(flow);
    $("cashflow-label").textContent = flow < 0 ? "more going out than coming in" : "left over each month";

    $("rate-value").textContent = profile.income > 0 ? (ratePct < 0 ? "−" + -ratePct : ratePct) + "%" : "–";
    $("rate-fill").style.width = Math.max(0, Math.min(100, ratePct)) + "%";
    $("rate-meter").setAttribute("aria-label", "Savings rate " + (profile.income > 0 ? ratePct + "%" : "not available"));

    let summary;
    if (profile.income === 0) summary = "With no income entered, there's no savings rate to show yet.";
    else if (flow > 0) summary = `You keep ${format.money(flow)} of every ${format.money(profile.income)} you earn. That's ${format.money(flow * 12)} a year.`;
    else if (flow === 0) summary = "You spend exactly what you earn, so nothing is left to save.";
    else summary = `You spend ${format.money(-flow)} more than you earn each month. That gap comes out of savings or adds to debt.`;
    $("summary").textContent = summary;

    $("stat-income").textContent = format.money(profile.income);
    $("stat-expenses").textContent = format.money(profile.expenses);
    $("stat-networth").textContent = format.signed(profile.netWorth);
    // what's left of the available funds after recorded spending
    $("stat-funds-item").hidden = !funds;
    if (funds) $("stat-funds").textContent = format.money(funds.balance);
  }

  /* The funds left and the recorded spending, each with a Remove button carrying the spending's
     id in data-expense-id; the money controller handles the clicks. */
  function showSpending(funds, ready) {
    const list = $("spending-list");
    list.replaceChildren();
    $("spending-add").disabled = !funds || !ready;
    if (!funds || !ready) {
      $("spending-left").textContent = "";
      return;
    }
    $("spending-left").textContent = funds.totalSpent > 0
      ? `Funds left: ${format.cents(funds.balance)} after ${format.cents(funds.totalSpent)} of spending.`
      : `Funds left: ${format.cents(funds.balance)}.`;

    for (const expense of funds.expenses) {
      const item = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = `${format.longDate(Expense.parseDate(expense.date))}: ${format.cents(expense.amount)}${expense.note ? ", " + expense.note : ""}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "link-btn";
      remove.textContent = "Remove";
      remove.dataset.expenseId = expense.id;
      remove.setAttribute("aria-label", `Remove ${format.cents(expense.amount)} spending`);
      item.append(text, remove);
      list.appendChild(item);
    }
  }

  const showSpendingError = (message) => { $("spending-error").textContent = message; };
  const showSpendingImpact = (text) => { $("spending-impact").textContent = text; };

  /* the spending date picker: today, and no later than today */
  function setSpendingDate(today) {
    const input = $("spendDate");
    input.max = today;
    input.value = today;
  }

  function clearSpendingInputs() {
    $("spendAmount").value = "";
    $("spendNote").value = "";
  }

  D.views.money = { showMoney, showSpending, showSpendingError, showSpendingImpact, setSpendingDate, clearSpendingInputs };
})(window.Dreamimin);
