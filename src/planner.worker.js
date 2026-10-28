/* ============================================================
   Runs PpoPlanner off the page so training doesn't freeze it.
   Gets { job }, posts each benchmark/progress message, then
   { type: "result", ...result }.
   ============================================================ */

"use strict";

importScripts("ppoPlanner.js");

self.onmessage = (ev) => {
  const result = PpoPlanner.plan(ev.data.job, { onProgress: (m) => self.postMessage(m) });
  self.postMessage({ type: "result", ...result });
};
