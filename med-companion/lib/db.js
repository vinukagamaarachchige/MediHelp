// Tiny JSON-file "database". Good enough for a single-user MVP running
// locally. Swap this out for SQLite/Postgres later without touching the
// rest of the app — every other file only calls the functions below.

import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "store.json");

const DEFAULT_DATA = {
  person: {
    name: "Elder",
    wake: "07:00",
    breakfast: "08:00",
    lunch: "13:00",
    dinner: "19:00",
    sleep: "22:00",
    pin: "1234",
    pinEnabled: true,
    theme: "light",
    language: "en",
  },
  caregivers: [
    { id: "c1", name: "Primary Caregiver", relationship: "Daughter", phone: "+94 77 123 4567", priority: 1 },
  ],
  medications: [],
  doses: [],
  alerts: [],
  activityLogs: [],
};

function ensureFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}

export function readDB() {
  ensureFile();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const data = JSON.parse(raw);
  
  // Ensure backward compatibility with existing store.json
  if (!data.activityLogs) data.activityLogs = [];
  if (!data.person) data.person = { ...DEFAULT_DATA.person };
  if (!data.person.pin) data.person.pin = "1234";
  if (data.person.pinEnabled === undefined) data.person.pinEnabled = true;
  if (!data.person.theme) data.person.theme = "light";
  if (!data.person.language) data.person.language = "en";
  if (!data.caregivers) data.caregivers = [...DEFAULT_DATA.caregivers];
  
  return data;
}

export function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function nextId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function logAgentActivity(db, type, message, details = {}) {
  if (!db.activityLogs) db.activityLogs = [];
  const entry = {
    id: nextId("act"),
    timestamp: new Date().toISOString(),
    type, // 'plan' | 'monitor' | 'escalate' | 'replan' | 'intake' | 'action'
    message,
    details,
  };
  db.activityLogs.unshift(entry);
  // Keep up to 200 logs
  if (db.activityLogs.length > 200) {
    db.activityLogs = db.activityLogs.slice(0, 200);
  }
  return entry;
}

