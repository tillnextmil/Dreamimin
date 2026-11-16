/* ============================================================
   RetirementPlan — retirement withdrawals.

   Until the retirement age the user keeps saving. From the
   retirement age on, a yearly amount is withdrawn at the start
   of each year. The plan works out the chance the money lasts
   to a chosen age.

   It uses the planners' wealth model (src/ppoPlanner.js):
       saving years      W(t+1) = max(0, W(t) + s) * growth
       withdrawal years  W(t+1) = (W(t) - w) * growth
       growth = exp[(mu - sigma^2/2) + sigma * Z]
   with one portfolio (risk level 1 to 5) held the whole time.
   The money has run out in the first year W(t) < w.
   Everything is in today's dollars (real returns). Tax and the
   order accounts are drawn from are left out.

   The chance is the share of fixed, seeded market paths where
   every withdrawal is paid, so the same inputs always give the
   same result.
   ============================================================ */

(function (global) {
  "use strict";

  const inNode = typeof module !== "undefined" && module.exports;
  const PpoPlanner = inNode ? require("./ppoPlanner") : global.PpoPlanner;
  const GoalProbability = inNode ? require("./goalProbability") : global.GoalProbability;

  const MIN_AGE = 18, MAX_AGE = 120;
  const PATHS = 4000;
  const PATH_SEED = 20261116;   // the fixed market paths every retirement plan is scored on

  /* the same Box-Muller draw the planners use */
  function gaussian(rnd) {
    const u = rnd() || 1e-12, v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* Every path is drawn for the longest plan there can be, so year t of path k is the same market
     year in every plan. A plan that asks for more (a later age, a bigger withdrawal) can then never
     come out with a better chance. */
  const STRIDE = MAX_AGE - MIN_AGE;
  const pathCache = {};
  function marketPaths(n) {
    if (pathCache[n]) return pathCache[n];
    const rnd = PpoPlanner.mulberry32(PATH_SEED);
    const z = new Float64Array(n * STRIDE);
    for (let i = 0; i < z.length; i++) z[i] = gaussian(rnd);
    return (pathCache[n] = z);
  }

  /* the value a share q of the way through a sorted list */
  function percentile(sorted, q) {
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  }

  class RetirementPlan {
    static MIN_AGE = MIN_AGE;
    static MAX_AGE = MAX_AGE;
    static PATHS = PATHS;

    constructor({ currentAge, retirementAge, lastsToAge, netWorth, monthlySaving = 0, yearlyWithdrawal, riskLevel = 3 }) {
      const fields = { currentAge, retirementAge, lastsToAge, netWorth, monthlySaving, yearlyWithdrawal, riskLevel };
      const errors = RetirementPlan.validate(fields);
      const invalid = Object.keys(errors);
      if (invalid.length) throw new RangeError(errors[invalid[0]]);
      Object.assign(this, fields);
      Object.freeze(this);
    }

    /* error message per invalid field; empty when everything is valid */
    static validate({ currentAge, retirementAge, lastsToAge, netWorth, monthlySaving = 0, yearlyWithdrawal, riskLevel = 3 }) {
      const errors = {};
      const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
      const isAge = (v) => Number.isInteger(v) && v >= MIN_AGE && v <= MAX_AGE;

      if (!isAge(currentAge)) errors.currentAge = `Age must be a whole number from ${MIN_AGE} to ${MAX_AGE}.`;
      if (!isAge(retirementAge)) errors.retirementAge = `Retirement age must be a whole number from ${MIN_AGE} to ${MAX_AGE}.`;
      else if (isAge(currentAge) && retirementAge < currentAge) errors.retirementAge = "Retirement age can't be before the current age.";
      if (!isAge(lastsToAge)) errors.lastsToAge = `The age the money should last to must be a whole number from ${MIN_AGE} to ${MAX_AGE}.`;
      else if (isAge(retirementAge) && lastsToAge <= retirementAge) errors.lastsToAge = "The money must last to an age after the retirement age.";

      if (!isNumber(netWorth)) errors.netWorth = "Net worth must be a number.";
      if (!isNumber(monthlySaving)) errors.monthlySaving = "Monthly saving must be a number.";
      else if (monthlySaving < 0) errors.monthlySaving = "Monthly saving can't be negative.";
      if (!isNumber(yearlyWithdrawal)) errors.yearlyWithdrawal = "Yearly withdrawal must be a number.";
      else if (yearlyWithdrawal <= 0) errors.yearlyWithdrawal = "Yearly withdrawal must be more than $0.";
      if (!Number.isInteger(riskLevel) || riskLevel < 1 || riskLevel > PpoPlanner.PORTFOLIOS.length) {
        errors.riskLevel = `Choose a risk level from 1 to ${PpoPlanner.PORTFOLIOS.length}.`;
      }
      return errors;
    }

    /* years of saving left before the first withdrawal */
    get yearsToRetirement() {
      return this.retirementAge - this.currentAge;
    }

    /* how many yearly withdrawals the money has to pay */
    get yearsInRetirement() {
      return this.lastsToAge - this.retirementAge;
    }

    /* everything withdrawn if the money lasts */
    get totalWithdrawals() {
      return this.yearlyWithdrawal * this.yearsInRetirement;
    }

    /* the same plan at another risk level */
    withRiskLevel(riskLevel) {
      return new RetirementPlan({ ...this, riskLevel });
    }

    /* Follows every market path from today to lastsToAge.
       Returns the chance the money lasts, the balance at retirement (10th/50th/90th percentile),
       the median balance left at lastsToAge, and the age the money runs out on an unlucky path
       (the 10th percentile; null when it lasts on that path too).
       options.paths is there to keep tests quick. */
    simulate(options = {}) {
      const n = options.paths ?? PATHS;
      if (!Number.isInteger(n) || n < 1) throw new RangeError("Paths must be a whole number, at least 1.");
      const save = this.yearsToRetirement, draw = this.yearsInRetirement;
      const { mu, sigma } = PpoPlanner.PORTFOLIOS[this.riskLevel - 1];
      const drift = mu - 0.5 * sigma * sigma;
      const s = this.monthlySaving * 12, w = this.yearlyWithdrawal;
      const z = marketPaths(n);

      const atRetirement = new Float64Array(n), atEnd = new Float64Array(n), runsOut = new Float64Array(n);
      let lasted = 0;
      for (let k = 0; k < n; k++) {
        let W = Math.max(0, this.netWorth), outAge = Infinity;
        for (let t = 0; t < save; t++) W = Math.max(0, W + s) * Math.exp(drift + sigma * z[k * STRIDE + t]);
        atRetirement[k] = W;
        for (let t = 0; t < draw; t++) {
          if (W < w) { outAge = this.retirementAge + t; W = 0; break; }
          W = (W - w) * Math.exp(drift + sigma * z[k * STRIDE + save + t]);
        }
        atEnd[k] = W;
        runsOut[k] = outAge;
        if (outAge === Infinity) lasted++;
      }

      const sorted = (a) => Array.from(a).sort((x, y) => x - y);
      const retire = sorted(atRetirement);
      const unluckyAge = percentile(sorted(runsOut), 0.1);
      const probability = new GoalProbability(lasted / n);
      return Object.freeze({
        probability,
        verdict: probability.verdict,
        balanceAtRetirement: Object.freeze({ p10: percentile(retire, 0.1), p50: percentile(retire, 0.5), p90: percentile(retire, 0.9) }),
        medianBalanceAtEnd: percentile(sorted(atEnd), 0.5),
        unluckyRunsOutAge: unluckyAge === Infinity ? null : unluckyAge,
      });
    }

    /* the chance the money lasts at each of the five risk levels, lowest risk first */
    compareRiskLevels(options = {}) {
      return PpoPlanner.PORTFOLIOS.map((p, i) => {
        const result = this.withRiskLevel(i + 1).simulate(options);
        return Object.freeze({ riskLevel: i + 1, name: p.name, probability: result.probability, verdict: result.verdict });
      });
    }

    /* The largest yearly withdrawal (to the dollar) whose chance of lasting is at least targetChance.
       0 when even $1 a year doesn't reach it. */
    sustainableWithdrawal(targetChance = GoalProbability.REALISTIC_FROM, options = {}) {
      if (typeof targetChance !== "number" || !(targetChance > 0 && targetChance <= 1)) {
        throw new RangeError("The target chance must be more than 0 and at most 1.");
      }
      const chance = (amount) => new RetirementPlan({ ...this, yearlyWithdrawal: amount }).simulate(options).probability.value;
      if (chance(1) < targetChance) return 0;
      let lo = 1, hi = 2;
      while (chance(hi) >= targetChance) {
        lo = hi; hi *= 2;
        if (hi > 1e12) return lo;   // more money than the withdrawals could ever use up
      }
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (chance(mid) >= targetChance) lo = mid; else hi = mid;
      }
      return lo;
    }

    /* the fields the server saves */
    toJSON() {
      return {
        currentAge: this.currentAge,
        retirementAge: this.retirementAge,
        lastsToAge: this.lastsToAge,
        netWorth: this.netWorth,
        monthlySaving: this.monthlySaving,
        yearlyWithdrawal: this.yearlyWithdrawal,
        riskLevel: this.riskLevel,
      };
    }
  }

  if (inNode) module.exports = RetirementPlan;
  else global.RetirementPlan = RetirementPlan;
})(typeof window !== "undefined" ? window : globalThis);
