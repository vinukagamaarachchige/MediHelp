const assert = require("node:assert/strict");
const createLoader = require("./loader.cjs");
const { response, request, cookies } = createLoader;
async function run() {
  const loader = createLoader();
  const supply = loader.load("lib/supply.js");
  assert.equal(
    supply.initialSupply({
      duration: "30 days",
      dose: "2 tablets",
      frequency: "twice daily",
    }),
    120,
  );
  assert.equal(
    supply.daysRemaining({
      currentSupply: 20,
      dose: "2 tablets",
      frequency: "twice daily",
    }),
    5,
  );
  assert.equal(supply.unitsPerDose({ dose: "0.5 tablet" }), 0.5);
  assert.equal(supply.unitsPerDose({ dose: "5 ml" }), null);
  assert.equal(
    loader
      .load("lib/routine.js")
      .anchorTimes({ sleep: "22:00" }, "bedtime", 1)[0],
    "22:00",
  );
  const auth = loader.load("lib/auth.js");
  const db = {
    person: {
      name: "Test elder",
      pinHash: auth.hashPin("246810"),
      pinEnabled: true,
      pinSetupRequired: false,
    },
    devices: [],
    medications: [
      {
        id: "m",
        name: "Test medicine",
        dose: "2 tablets",
        frequency: "twice daily",
        currentSupply: 22,
      },
    ],
    doses: [
      {
        id: "d",
        medicationId: "m",
        status: "pending",
        scheduledTime: new Date().toISOString(),
        reminderDeliveries: { "https://private-push.example/token": "sent" },
      },
    ],
    alerts: [],
    activityLogs: [],
  };
  loader.mock("lib/db.js", {
    readDB: () => db,
    writeDB: () => {},
    nextId: () => require("crypto").randomUUID(),
    logAgentActivity: () => {},
  });
  const res = response(),
    req = request("POST", { status: "taken" });
  req.query.id = "d";
  auth.startSession(req, res, db);
  req.headers.cookie = cookies(res);
  const handler = loader.load("pages/api/doses/[id]/status.js").default;
  await handler(req, res);
  assert.equal(res.code, 200);
  assert.equal(db.medications[0].currentSupply, 20);
  assert.equal(db.alerts[0].daysRemaining, 5);
  assert.equal(res.body.dose.reminderDeliveries, undefined);
  const confirmed = db.doses[0].confirmedAt;
  await handler(req, res);
  assert.equal(db.medications[0].currentSupply, 20);
  assert.equal(db.doses[0].confirmedAt, confirmed);
  assert.equal(db.alerts.length, 1);
  req.body.status = "skipped";
  await handler(req, res);
  assert.equal(res.code, 409);
  assert.equal(db.doses[0].status, "taken");
  const overdue = loader.load("lib/doseState.js");
  assert.equal(
    overdue.isOverdue({
      status: "taken",
      scheduledTime: new Date(0).toISOString(),
    }),
    false,
  );
  assert.equal(
    overdue.isOverdue({
      status: "pending",
      scheduledTime: new Date(Date.now() - 11 * 60000).toISOString(),
      medication: { criticality: "critical" },
    }),
    true,
  );
  console.log(
    "Safety tests passed: quantity, depletion, duplicate lock, timestamp preservation, bedtime and overdue grace.",
  );
}
module.exports = run;
if (require.main === module)
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
