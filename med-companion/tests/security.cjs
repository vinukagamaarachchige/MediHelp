const assert = require("node:assert/strict"),
  crypto = require("crypto"),
  path = require("path");
const createLoader = require("./loader.cjs");
const { response, request, cookies } = createLoader;
async function run() {
  const runtimeSource = require("fs").readFileSync(
    "scripts/runtime.cjs",
    "utf8",
  );
  const runtimeModule = { exports: {} };
  require("vm").runInNewContext(runtimeSource, {
    module: runtimeModule,
    process: { versions: { node: "20.19.6" }, env: {} },
    URL,
  });
  assert.throws(() => runtimeModule.exports());
  const loader = createLoader();
  const auth = loader.load("lib/auth.js");
  const db = {
    person: {
      name: "Private elder",
      pinHash: auth.hashPin("246810"),
      pinSetupRequired: false,
      pinEnabled: true,
    },
    devices: [],
    medications: [
      {
        id: "m",
        name: "Test medicine",
        dose: "1 tablet",
        frequency: "once daily",
        currentSupply: 20,
      },
    ],
    doses: [
      {
        id: "d",
        medicationId: "m",
        status: "pending",
        scheduledTime: new Date(Date.now() - 60000).toISOString(),
      },
    ],
    alerts: [],
    activityLogs: [],
    caregivers: [],
  };
  loader.mock("lib/db.js", {
    readDB: () => db,
    writeDB: () => {},
    nextId: () => crypto.randomUUID(),
    logAgentActivity: () => {},
  });
  const guard = loader.load("lib/apiSecurity.js");
  assert.equal(guard.allowedHost("attacker.example"), false);
  assert.equal(guard.allowedHost("localhost:3000"), true);
  assert.equal(guard.allowedHost("localhost.evil:3000"), false);
  const cross = request("POST", { x: 1 });
  cross.headers.origin = "https://evil.example";
  assert.throws(() => guard.checkRequest(cross));
  const body = request("POST", "{}");
  body.headers["content-type"] = "text/plain";
  assert.throws(() => guard.checkRequest(body));
  const meds = loader.load("pages/api/medications.js").default;
  let res = response();
  await meds(request(), res);
  assert.equal(res.code, 401);
  const status = loader.load("pages/api/doses/[id]/status.js").default;
  res = response();
  await status(
    request("POST", { status: "taken" }, { query: { id: "d" } }),
    res,
  );
  assert.equal(res.code, 401);
  assert.equal(db.doses[0].status, "pending");
  const login = request("POST", { verifyPin: "246810" });
  const settings = loader.load("pages/api/settings.js").default;
  res = response();
  await settings(login, res);
  assert.equal(res.code, 200);
  const cookie = cookies(res);
  assert(cookie.includes("companion_device="));
  assert(
    res.headers["Set-Cookie"].every(
      (x) => x.includes("HttpOnly") && x.includes("SameSite=Strict"),
    ),
  );
  const enrolled = request();
  enrolled.headers.cookie = cookie;
  res = response();
  await meds(enrolled, res);
  assert.equal(res.code, 200);
  const lock = response();
  auth.endSession(enrolled, lock);
  assert.equal(auth.isCaregiver(enrolled, db), false);
  assert.equal(auth.isDevice(enrolled, db), true);
  const change = request("PUT", { dose: "8 tablets" }, { query: { id: "m" } });
  change.headers.cookie = cookie;
  res = response();
  await loader.load("pages/api/medications/[id].js").default(change, res);
  assert.equal(res.code, 401);
  assert.equal(db.medications[0].dose, "1 tablet");
  res = response();
  await settings(request(), res);
  assert.equal(res.body.person.name, undefined);
  assert.equal(res.body.person.pinHash, undefined);
  assert.equal(res.body.person.pin, undefined);
  const validation = loader.load("lib/validation.js");
  assert.throws(() =>
    validation.medicationInput({ name: [], frequency: "once daily" }),
  );
  assert.throws(() => validation.medicationInput({ name: "A", admin: true }));
  assert.throws(() =>
    validation.medicationInput({ name: "A", currentSupply: -1 }),
  );
  assert.throws(() =>
    validation.photoData(
      "data:image/png;base64," +
        Buffer.from("<svg onload=alert(1)>").toString("base64"),
    ),
  );
  assert.throws(() => validation.photoData("https://evil.example/photo"));

  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9YQAAAAASUVORK5CYII=";
  assert.equal(validation.photoData(pixel), pixel);
  const bomb = Buffer.from(pixel.split(",")[1], "base64");
  bomb.writeUInt32BE(100000, 16);
  assert.throws(() =>
    validation.photoData("data:image/png;base64," + bomb.toString("base64")),
  );
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const keys = {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: crypto.randomBytes(16).toString("base64url"),
  };
  const push = loader.load("lib/pushValidation.js");
  assert(
    push.validateSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      keys,
    }),
  );
  for (const endpoint of [
    "https://127.0.0.1/private",
    "https://fcm.googleapis.com.evil.example/token",
    "https://fcm.googleapis.com@evil.example/token",
    "https://fcm.googleapis.com:8443/token",
    "http://fcm.googleapis.com/token",
  ])
    assert.throws(() => push.validateSubscription({ endpoint, keys }));
  assert.throws(() =>
    push.validateSubscription({
      endpoint: "https://fcm.googleapis.com/token",
      keys: { p256dh: "a", auth: "b" },
    }),
  );

  const previousOrigin = process.env.COMPANION_ORIGIN;
  process.env.COMPANION_ORIGIN = "https://companion.example";
  try {
    const httpsRequest = request();
    httpsRequest.headers.host = "companion.example";
    assert.throws(() => guard.checkRequest(httpsRequest));
    httpsRequest.headers["x-forwarded-proto"] = "https";
    assert.doesNotThrow(() => guard.checkRequest(httpsRequest));
    const httpsResponse = response();
    auth.startSession(httpsRequest, httpsResponse, db);
    assert(
      httpsResponse.headers["Set-Cookie"].every(
        (cookie) => cookie.startsWith("__Host-") && cookie.includes("; Secure"),
      ),
    );
    const middleware = loader.load("middleware.js").middleware;
    const redirect = middleware({
      headers: new Map([["host", "companion.example"]]),
      nextUrl: new URL("http://companion.example//attacker.example/path"),
    });
    assert.equal(
      new URL(redirect.headers.get("location")).host,
      "companion.example",
    );
    const localRequest = request("POST", {});
    localRequest.headers.origin = "http://localhost:3000";
    assert.doesNotThrow(() => guard.checkRequest(localRequest));
  } finally {
    if (previousOrigin === undefined) delete process.env.COMPANION_ORIGIN;
    else process.env.COMPANION_ORIGIN = previousOrigin;
  }
  const local = request();
  local.headers["x-forwarded-for"] = "127.0.0.1";
  assert.equal(auth.canSetupLocally(local), true);
  local.headers["x-forwarded-for"] = "203.0.113.9";
  assert.equal(auth.canSetupLocally(local), false);
  let sends = 0,
    release;
  const background = createLoader({
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: () => {
        sends++;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    },
  });
  background.mock("lib/db.js", {
    readDB: () => db,
    writeDB: () => {},
    nextId: () => crypto.randomUUID(),
    logAgentActivity: () => {},
  });
  const secret = "a".repeat(64);
  background.mock("scripts/push-config.cjs", () => ({
    secret,
    publicKey: "test",
    privateKey: "test",
    subject: "https://localhost",
  }));
  const scheduler = background.load("pages/api/reminders.js").default;
  const scheduled = () => {
    const req = request("POST");
    req.headers.authorization = `Bearer ${secret}`;
    return req;
  };
  db.pushSubscriptions = [
    { endpoint: "https://127.0.0.1/private", keys, deviceId: db.devices[0].id },
  ];
  res = response();
  await scheduler(scheduled(), res);
  assert.equal(res.code, 200);
  assert.equal(sends, 0);
  assert.equal(db.pushSubscriptions.length, 0);
  db.pushSubscriptions = [
    {
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      keys,
      deviceId: db.devices[0].id,
    },
  ];
  const inFlight = scheduler(scheduled(), response());
  assert.equal(sends, 1);
  res = response();
  await scheduler(scheduled(), res);
  assert.equal(res.code, 409);
  db.doses[0].status = "taken";
  db.medications[0].currentSupply = 19;
  release();
  await inFlight;
  assert.equal(db.doses[0].status, "taken");
  assert.equal(db.medications[0].currentSupply, 19);
  db.doses = [
    {
      id: "d",
      medicationId: "m",
      status: "pending",
      scheduledTime: new Date(Date.now() - 60000).toISOString(),
    },
  ];
  const retiring = scheduler(scheduled(), response());
  assert.equal(sends, 2);
  db.doses = [];
  release();
  await retiring;
  assert.equal(db.doses.length, 0);
  const old = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "";
  try {
    const extract = loader.load("lib/llmExtract.js").extractMedications;
    await assert.rejects(extract({ imageBase64: "anything" }));
    const parsed = await extract({ text: "Metformin 500mg" });
    assert.equal(parsed.items[0].dose, "");
    assert.equal(parsed.items[0].duration, "");
    assert.equal(parsed.items[0].frequency, "");
  } finally {
    if (old === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = old;
  }
  // Auth state cannot be bypassed by a PIN-disabled profile without an enrolled device.
  assert.equal(
    auth.isCaregiver(request(), {
      person: {
        pinEnabled: false,
        pinHash: auth.hashPin("246810"),
        pinSetupRequired: false,
      },
      devices: [],
    }),
    false,
  );
  const malformed = auth.validPin("123456", { pinHash: "malformed" });
  assert.equal(malformed, false);

  for (let i = 0; i < 5; i++) {
    const attempt = request(
      "POST",
      { verifyPin: "135790" },
      { socket: { remoteAddress: "203.0.113.5" } },
    );
    res = response();
    await settings(attempt, res);
    assert.equal(res.code, 401);
  }
  const distributed = request(
    "POST",
    { verifyPin: "246810" },
    { socket: { remoteAddress: "203.0.113.6" } },
  );
  res = response();
  await settings(distributed, res);
  assert.equal(res.code, 429);
  for (let i = 0; i < 5; i++) auth.pinAttempt(request(), false);
  assert.equal(auth.pinAttempt(request()), false);
  console.log(
    "Security tests passed: device enrollment, caregiver roles, private reads, CSRF/host guards, mass assignment, photo validation, SSRF rejection (including persisted endpoints), reminder concurrency/merge, PIN controls and fail-closed extraction.",
  );
}
module.exports = run;
if (require.main === module)
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
