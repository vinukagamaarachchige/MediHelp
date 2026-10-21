import dataDirectory from "../scripts/data-directory.cjs";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { hashPin, validPin } from "./auth";

const DB_PATH = path.join(dataDirectory(), "store.json");
const DEFAULT_DATA = {
  person: {
    name: "Elder",
    wake: "07:00",
    breakfast: "08:00",
    lunch: "13:00",
    dinner: "19:00",
    sleep: "22:00",
    pinEnabled: true,
    pinSetupRequired: true,
    theme: "light",
    language: "en",
    fontScale: 100,
  },
  caregivers: [],
  medications: [],
  doses: [],
  alerts: [],
  activityLogs: [],
  devices: [],
};
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/(?:^pin$|pinHash|secret|token|authorization|cookie|pillPhoto|imageBase64|reminderDeliveries)/i.test(
              key,
            ),
        )
        .map(([key, item]) => [key, redact(item)]),
    );
  return value;
}
function ensureFile() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(DB_PATH))
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
}
export function readDB() {
  ensureFile();
  const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid data store");
  let migrated = false;
  data.person ||= { ...DEFAULT_DATA.person };
  for (const field of [
    "caregivers",
    "medications",
    "doses",
    "alerts",
    "activityLogs",
    "devices",
  ])
    if (!Array.isArray(data[field])) data[field] = [];
  if (data.person.pinSetupRequired === undefined) {
    data.person.pinSetupRequired = data.person.pinHash
      ? validPin("1234", data.person)
      : !data.person.pin || data.person.pin === "1234";
    migrated = true;
  }
  if (data.person.pin) {
    data.person.pinHash = hashPin(String(data.person.pin));
    delete data.person.pin;
    migrated = true;
  }
  for (const key of ["theme", "language", "pinEnabled", "fontScale"])
    if (data.person[key] === undefined)
      data.person[key] = DEFAULT_DATA.person[key];
  if (migrated) {
    data.activityLogs = data.activityLogs.map(redact);
    writeDB(data);
  }
  return data;
}
export function writeDB(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });
  const serialized = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(serialized, "utf8") > 64 * 1024 * 1024)
    throw new Error("Data store size limit reached");
  const temp = `${DB_PATH}.${randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, "wx", 0o600);
    try {
      fs.writeFileSync(fd, serialized);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, DB_PATH);
  } finally {
    try {
      fs.unlinkSync(temp);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
export function nextId(prefix) {
  return `${prefix}_${randomUUID()}`;
}
export function logAgentActivity(db, type, message, details = {}) {
  const entry = {
    id: nextId("act"),
    timestamp: new Date().toISOString(),
    type,
    message,
    details: redact(details),
  };
  db.activityLogs ||= [];
  db.activityLogs.unshift(entry);
  db.activityLogs = db.activityLogs.slice(0, 200);
  return entry;
}
