/* ============================================================
   Step 1 view (Your money): the monthly money results, the
   list of recorded spending and the spending-by-category chart
   (pieChart.js). Display only: it reads from the
   FinancialProfile and AvailableFunds it is given and never
   changes them or calls the server.
   ============================================================ */

(function (D) {
  "use strict";

  const { format, PieChart } = D;
  const $ = (id) => document.getElementById(id);

  /* a share from 0 to 1 as a whole percent, never "0%" or "100%" for a part: 0.004 -> "<1%", 0.996 -> ">99%" */
  function percent(share) {
    const whole = Math.round(share * 100);
    if (share > 0 && whole === 0) return "<1%";
    if (share < 1 && whole === 100) return ">99%";
    return whole + "%";
  }

  /* "transport" -> "Transport" */
  const categoryName = (category) => category.charAt(0).toUpperCase() + category.slice(1);

  /* a coloured dot for a category; the stylesheet gives each category its colour */
  function swatch(category) {
    const dot = document.createElement("span");
    dot.className = "swatch";
    dot.dataset.key = category;
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }

  /* fills the category picker, with `selected` chosen */
  function showCategories(categories, selected) {
    const select = $("spendCategory");
    select.replaceChildren(...categories.map((category) => new Option(categoryName(category), category)));
    select.value = selected;
  }

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
    // with an emergency fund, what it keeps aside and what's left for the goals
    const keeps = profile.emergencyFund > 0;
    $("stat-kept-item").hidden = !keeps;
    $("stat-goals-item").hidden = !keeps;
    if (keeps) {
      $("stat-kept").textContent = format.money(profile.emergencyFund);
      $("stat-goals").textContent = format.money(profile.moneyForGoals(funds ? funds.balance : null));
    }
  }

  /* The funds left and the recorded spending, each with its category and a Remove button carrying
     the spending's id in data-expense-id; the money controller handles the clicks. byCategory is
     AvailableFunds.spendingByCategory(), for the chart. */
  function showSpending(funds, ready, byCategory = []) {
    const list = $("spending-list");
    list.replaceChildren();
    $("spending-add").disabled = !funds || !ready;
    showByCategory(funds && ready ? byCategory : []);
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
      text.className = "spending__text";
      text.textContent = `${format.longDate(Expense.parseDate(expense.date))}: ${format.cents(expense.amount)}${expense.note ? ", " + expense.note : ""}`;
      const category = document.createElement("span");
      category.className = "spending__category";
      category.append(swatch(expense.category), categoryName(expense.category));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "link-btn";
      remove.textContent = "Remove";
      remove.dataset.expenseId = expense.id;
      remove.setAttribute("aria-label", `Remove ${format.cents(expense.amount)} spending`);
      const info = document.createElement("div");
      info.className = "spending__info";
      info.append(text, category);
      item.append(info, remove);
      list.appendChild(item);
    }
  }

  /* The ring and its legend, largest category first, once spending is in two categories or more:
     with one there is nothing to split, and the list already says it all. rows: [{ category,
     amount, share }]. */
  function showByCategory(rows) {
    const chart = $("spend-chart");
    chart.hidden = rows.length < 2;
    if (chart.hidden) return;
    const built = PieChart.build({
      slices: rows.map((r) => ({ key: r.category, value: r.amount, label: `${categoryName(r.category)}: ${format.cents(r.amount)}` })),
    });
    $("spend-pie").innerHTML = built.svg;
    $("spend-total").textContent = format.money(rows.reduce((sum, r) => sum + r.amount, 0));

    const legend = $("spend-legend");
    legend.replaceChildren();
    for (const { category, amount, share } of rows) {
      const item = document.createElement("li");
      item.dataset.key = category;
      const name = document.createElement("span");
      name.className = "spend-chart__name";
      name.textContent = categoryName(category);
      const money = document.createElement("span");
      money.className = "spend-chart__amount";
      money.textContent = format.cents(amount);
      const part = document.createElement("span");
      part.className = "spend-chart__share";
      part.textContent = percent(share);
      item.append(swatch(category), name, money, part);
      legend.append(item);
    }
  }

  /* pointing at a slice or a legend row brings out that category in both */
  function highlight(category) {
    const chart = $("spend-chart");
    if (category) chart.dataset.active = category;
    else delete chart.dataset.active;
    for (const el of chart.querySelectorAll("[data-key]")) el.classList.toggle("is-active", el.dataset.key === category);
  }
  $("spend-chart").addEventListener("pointerover", (event) => {
    const target = event.target.closest(".pie-slice, .spend-chart__legend li");
    highlight(target ? target.dataset.key : null);
  });
  $("spend-chart").addEventListener("pointerleave", () => highlight(null));

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

  D.views.money = { showMoney, showCategories, showSpending, showSpendingError, showSpendingImpact, setSpendingDate, clearSpendingInputs };
})(window.Dreamimin);
