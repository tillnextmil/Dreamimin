/* ============================================================
   Step 3 view (Your chances): the planner's progress and its
   result for the selected goal, a GoalAnalysisResult. Display
   only; the odds controller runs the planner.
   ============================================================ */

(function (D) {
  "use strict";

  const { format } = D;
  const $ = (id) => document.getElementById(id);

  /* plan: { netWorth, keepsFund, monthly, cost, months, date } as the odds controller built it;
     netWorth is the money for goals, after the emergency fund when keepsFund is true */
  function reason(plan, probability) {
    const { netWorth, keepsFund, monthly, cost, months, date } = plan;
    const have = Math.max(0, netWorth);
    const yours = `the ${format.money(have)} you have for goals` + (keepsFund ? " after your emergency fund" : "");
    let text;
    if (monthly <= 0) {
      text = `You aren't saving anything each month, so only ${yours} can grow toward this.`;
    } else {
      text = `Saving ${format.money(monthly)} a month until ${format.monthYear(date)}, plus ${yours}, adds up to ${format.money(have + monthly * months)} before any growth, against the goal's ${format.money(cost)}.`;
    }
    if (!probability.isRealistic) {
      const need = (cost - have) / months;
      if (need > Math.max(0, monthly)) text += ` Without growth it would take saving about ${format.money(need)} a month.`;
      else text += ` The money is there on paper; the risk is a bad run in the markets right before ${format.monthYear(date)}.`;
    }
    return text;
  }

  function showEmpty(text) {
    $("odds-empty").hidden = false;
    $("odds-result").hidden = true;
    $("odds-empty-text").textContent = text;
  }

  /* The result area before the first progress message, while the planner gets ready. For another
     goal (fresh), the last goal's details are hidden so they aren't read as this goal's. */
  function showWorking(fresh) {
    $("odds-empty").hidden = true;
    $("odds-result").hidden = false;
    if (fresh) {
      $("odds-stats").hidden = true;
      $("odds-facts").hidden = true;
      $("odds-reason").textContent = "";
    }
    $("odds-verdict").className = "status status--mid";
    $("odds-verdict").textContent = $("odds-stats").hidden ? "Working it out…" : "Updating…";
  }

  function showTraining(done, total, prob) {
    $("odds-empty").hidden = true;
    $("odds-result").hidden = false;
    $("odds-result").setAttribute("aria-busy", "true");
    $("odds-training").hidden = false;
    $("odds-bar").style.width = total ? Math.round((100 * done) / total) + "%" : "0%";
    $("odds-training-text").textContent = total ? `Training the planner… round ${done} of ${total}` : "Training the planner…";
    if (prob !== null && prob !== undefined) $("odds-prob").textContent = new GoalProbability(prob).toPercent();
  }

  const showTrainingError = () => {
    $("odds-training-text").textContent = "The planner hit an error. Try changing a value.";
  };

  /* result is a GoalAnalysisResult */
  function showPlan(plan, result) {
    const { probability, benchmark, outcomes } = result;
    $("odds-empty").hidden = true;
    $("odds-result").hidden = false;
    $("odds-result").setAttribute("aria-busy", "false");
    $("odds-training").hidden = true;
    $("odds-prob").textContent = probability.toPercent();
    $("odds-verdict").className = "status status--" + probability.tone;
    $("odds-verdict").textContent = probability.verdict;
    $("odds-reason").textContent = reason(plan, probability);

    $("odds-stats").hidden = false;
    $("odds-rl").textContent = probability.toPercent();
    $("odds-dp").textContent = benchmark.toPercent();
    $("odds-efficiency").textContent = result.efficiencyText();

    $("odds-facts").hidden = false;
    $("odds-glide").textContent = result.describeGlide(new Date().getFullYear());
    $("odds-range").textContent = `About ${format.money(outcomes.typical)} by ${format.monthYear(plan.date)} in a typical market; ${format.money(outcomes.bad)} in a bad one, ${format.money(outcomes.good)} in a good one.`;
    $("odds-efficiency-text").textContent = result.efficiency === null
      ? "As a check, an exact dynamic-programming solution of the same problem also can't reach this goal, so there's no RL efficiency to show."
      : `As a check, an exact dynamic-programming solution of the same problem reaches the goal ${benchmark.toPercent()} of the time. The PPO planner gets ${result.efficiencyText()} of that (its RL efficiency).`;
  }

  /* lists the five investment portfolios, lowest risk first, in "How we got this number" */
  function showPortfolios(portfolios) {
    const list = $("portfolio-list");
    list.replaceChildren();
    for (const portfolio of portfolios) {
      const item = document.createElement("li");
      item.textContent = portfolio.describe();
      list.appendChild(item);
    }
  }

  D.views.odds = { showEmpty, showWorking, showTraining, showTrainingError, showPlan, showPortfolios };
})(window.Dreamimin);
