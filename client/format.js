/* ============================================================
   Formatting and input parsing shared by the views and the
   controllers: money, dates, and reading what was typed in a
   money field. No DOM and no business rules.
   ============================================================ */

(function (global) {
  "use strict";

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  const pad = (n) => String(n).padStart(2, "0");

  const format = {
    money: (n) => money.format(n),                       // $4,500
    cents: (n) => cents.format(n),                       // $45.50
    plain: (n) => plain.format(n),                       // 4,500 (for putting back in a field)
    signed: (n) => (n < 0 ? "−" : "") + money.format(Math.abs(n)),
    longDate: (date) => date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    monthYear: (date) => date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    shortMonthYear: (date) => date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    plural: (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`,

    /* "$4,500" -> 4500; empty -> null; anything else that isn't a number -> NaN */
    parseAmount(text) {
      const cleaned = String(text).replace(/[\s,$]/g, "");
      if (cleaned === "") return null;
      return /^-?\d*\.?\d+$/.test(cleaned) ? Number(cleaned) : NaN;
    },

    /* a Date as "YYYY-MM-DD" in local time, the format <input type="date"> uses */
    isoDate: (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = format;
  else (global.Dreamimin = global.Dreamimin || {}).format = format;
})(typeof window !== "undefined" ? window : globalThis);
