// Unit tests for GoalList: the 20-goal limit, sorting and searching (SPECIFICATIONS.md, item 12).
// Author: Aiyan Tong

const GoalList = require("../src/goalList");

// Goals in the API's shape; ids show the order they were created in.
const GOALS = [
  { id: 1, name: "Car", targetAmount: 12000, targetDate: "2028-06-01", priority: 4 },
  { id: 2, name: "trip to Japan", targetAmount: 4500, targetDate: "2027-03-15", priority: 2 },
  { id: 3, name: "Emergency fund", targetAmount: 30000, targetDate: "2027-12-01", priority: 5 },
  { id: 4, name: "Camera", targetAmount: 4500, targetDate: "2027-03-15", priority: 2 },
];
const names = (goals) => goals.map((g) => g.name);

// normal case: the default order is soonest target date first, the older goal first on a tie
test("lists the soonest target date first by default", () => {
  expect(names(GoalList.arrange(GOALS))).toEqual(["trip to Japan", "Camera", "Emergency fund", "Car"]);
});

// normal case: most important first, then soonest, then oldest
test("sorts by priority, most important first", () => {
  expect(names(GoalList.arrange(GOALS, { sort: "priority" }))).toEqual(["Emergency fund", "Car", "trip to Japan", "Camera"]);
});

// normal case: largest amount first; equal amounts fall back to the date, then the older goal
test("sorts by amount, largest first", () => {
  expect(names(GoalList.arrange(GOALS, { sort: "amount" }))).toEqual(["Emergency fund", "Car", "trip to Japan", "Camera"]);
});

// edge case: name order ignores capitals, so "trip" comes after "Emergency"
test("sorts by name from A to Z, ignoring capitals", () => {
  expect(names(GoalList.arrange(GOALS, { sort: "name" }))).toEqual(["Camera", "Car", "Emergency fund", "trip to Japan"]);
});

// normal case: search keeps names that contain the text, ignoring case and surrounding spaces
test("search keeps the goals whose name contains the text", () => {
  expect(names(GoalList.arrange(GOALS, { search: "  CA " }))).toEqual(["Camera", "Car"]);
  expect(names(GoalList.arrange(GOALS, { search: "japan", sort: "name" }))).toEqual(["trip to Japan"]);
});

// edge case: nothing matches, and an empty search keeps everything
test("search can match nothing or everything", () => {
  expect(GoalList.arrange(GOALS, { search: "boat" })).toEqual([]);
  expect(GoalList.arrange(GOALS, { search: "" })).toHaveLength(4);
});

// edge case: arranging returns a new array and leaves the original order alone
test("doesn't change the list it is given", () => {
  const before = names(GOALS);
  GoalList.arrange(GOALS, { sort: "name" });
  expect(names(GOALS)).toEqual(before);
});

// wrong case: an unknown sort is rejected with the API's message
test.each(["size", "", "Date", "soonest"])("rejects the sort %p", (sort) => {
  expect(GoalList.checkSort(sort)).toBe("Sort by date, priority, amount or name.");
  expect(() => GoalList.arrange(GOALS, { sort })).toThrow(RangeError);
});

test.each(GoalList.SORTS)("accepts the sort %p", (sort) => {
  expect(GoalList.checkSort(sort)).toBeNull();
});

// edge case: up to 20 goals; the 21st can't be added
test("allows adding until there are 20 goals", () => {
  expect(GoalList.canAdd(0)).toBe(true);
  expect(GoalList.canAdd(19)).toBe(true);
  expect(GoalList.canAdd(20)).toBe(false);
  expect(GoalList.TOO_MANY).toBe("You can have up to 20 goals.");
});
