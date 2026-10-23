/* ============================================================
   TaxCalculator — 2026 federal brackets, single filer (simplified),
   plus the IRS tables retirement withdrawals depend on.
   ============================================================ */

(function (global) {
  "use strict";

  class TaxCalculator {
    static STD_DEDUCTION = 16100;
    static BRACKETS = [
      [12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24],
      [256225, 0.32], [640600, 0.35], [Infinity, 0.37],
    ];
    static CAP_GAINS = 0.15;
    static GAINS_ZERO_TOP = 49450;
    static RMD_AGE = 75;

    /* gross income at the top of each bracket a withdrawal plan can fill up to */
    static FILL = {
      "10%": TaxCalculator.STD_DEDUCTION + 12400,
      "12%": TaxCalculator.STD_DEDUCTION + 50400,
      "22%": TaxCalculator.STD_DEDUCTION + 105700,
    };

    /* required minimum distribution divisor: IRS Uniform Lifetime Table (2022 onward), ages 72 to 120 */
    static UNIFORM_LIFETIME = [
      27.4, 26.5, 25.5, 24.6, 23.7, 22.9, 22.0, 21.1, 20.2, 19.4, 18.5, 17.7, 16.8, 16.0, 15.2, 14.4, 13.7,
      12.9, 12.2, 11.5, 10.8, 10.1, 9.5, 8.9, 8.4, 7.8, 7.3, 6.8, 6.4, 6.0, 5.6, 5.2, 4.9, 4.6, 4.3, 4.1,
      3.9, 3.7, 3.5, 3.4, 3.3, 3.1, 3.0, 2.9, 2.8, 2.7, 2.5, 2.3, 2.0,
    ];

    /* expected return multiple by age: IRS Publication 939, Table V */
    static TABLE_V = [[50, 33.1], [55, 28.6], [60, 24.2], [65, 20.0], [70, 16.0], [75, 12.5], [80, 9.5], [85, 6.9], [90, 5.0]];

    static ordinaryTax(gross) {
      let taxable = Math.max(0, gross - TaxCalculator.STD_DEDUCTION), tax = 0, prev = 0;
      for (const [top, rate] of TaxCalculator.BRACKETS) {
        if (taxable <= prev) break;
        tax += (Math.min(taxable, top) - prev) * rate;
        prev = top;
      }
      return tax;
    }

    /* gains sit on top of ordinary income: 0% up to the threshold, 15% above (20% tier ignored) */
    static totalTax(ordinary, gains) {
      const unusedDeduction = Math.max(0, TaxCalculator.STD_DEDUCTION - ordinary);
      const taxableGains = Math.max(0, gains - unusedDeduction);
      const ordTaxable = Math.max(0, ordinary - TaxCalculator.STD_DEDUCTION);
      const zeroRoom = Math.max(0, TaxCalculator.GAINS_ZERO_TOP - ordTaxable);
      return TaxCalculator.ordinaryTax(ordinary) + TaxCalculator.CAP_GAINS * Math.max(0, taxableGains - zeroRoom);
    }

    static rmdDivisor(age) {
      const table = TaxCalculator.UNIFORM_LIFETIME;
      return table[Math.min(table.length - 1, Math.max(0, age - 72))];
    }

    static lifeMultiple(age) {
      const table = TaxCalculator.TABLE_V;
      if (age <= table[0][0]) return table[0][1];
      for (let k = 1; k < table.length; k++) {
        const [a1, m1] = table[k], [a0, m0] = table[k - 1];
        if (age <= a1) return m0 + ((m1 - m0) * (age - a0)) / (a1 - a0);
      }
      return table[table.length - 1][1];
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = TaxCalculator;
  else global.TaxCalculator = TaxCalculator;
})(typeof window !== "undefined" ? window : globalThis);
