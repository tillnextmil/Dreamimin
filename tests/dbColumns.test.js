// Unit test for server/db.js opening a database file made before columns were added to
// schema.sql: the missing columns are added and the rows already saved are kept.
// Author: Autiana Wallace

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { openDatabase, PROFILE_ID } = require("../server/db");

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamimin-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const columnsOf = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

// normal case: an old file gets emergency_fund and entered, and keeps its saved values
test("adds missing columns to an older database file", () => {
  const file = path.join(dir, "old.db");
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE profile (profile_id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT 'My profile',
      monthly_income REAL, monthly_expenses REAL, net_worth REAL NOT NULL DEFAULT 0);
    CREATE TABLE available_funds (funds_id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL UNIQUE,
      balance REAL NOT NULL);
    INSERT INTO profile (profile_id, monthly_income) VALUES (1, 4800);
  `);
  old.close();

  const db = openDatabase(file);
  expect(columnsOf(db, "profile")).toContain("emergency_fund");
  expect(columnsOf(db, "available_funds")).toContain("entered");
  expect(db.prepare("SELECT monthly_income, emergency_fund FROM profile WHERE profile_id = ?").get(PROFILE_ID))
    .toEqual({ monthly_income: 4800, emergency_fund: 0 });
  db.close();
});

// edge case: opening a file twice doesn't try to add the columns again
test("opening an up-to-date file again changes nothing", () => {
  const file = path.join(dir, "new.db");
  openDatabase(file).close();
  const db = openDatabase(file);
  expect(columnsOf(db, "available_funds").filter((c) => c === "entered")).toHaveLength(1);
  db.close();
});