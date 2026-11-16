/* ============================================================
   Runs the planners off the page so training doesn't freeze it.

   { job } trains a plan: PpoPlanner for one goal ({ cost, months }),
   MultiGoalPlanner for a job with a list of goals. Posts each
   benchmark/progress message, then { type: "result", ...result }.

   { task: "compare", job } posts { type: "comparison", levels },
   the five risk levels side by side.
   { task: "whatIf", job, changes } posts { type: "whatIf", before,
   after, utilityChange, goals }.
   ============================================================ */

"use strict";

importScripts("ppoPlanner.js", "multiGoalPlanner.js");

self.onmessage = (ev) => {
  const { task = "plan", job, changes } = ev.data;
  if (task === "compare") {
    self.postMessage({ type: "comparison", levels: MultiGoalPlanner.compareRiskLevels(job) });
    return;
  }
  if (task === "whatIf") {
    self.postMessage({ type: "whatIf", ...MultiGoalPlanner.whatIf(job, changes) });
    return;
  }
  const planner = Array.isArray(job.goals) ? MultiGoalPlanner : PpoPlanner;
  const result = planner.plan(job, { onProgress: (m) => self.postMessage(m) });
  self.postMessage({ type: "result", ...result });
};
