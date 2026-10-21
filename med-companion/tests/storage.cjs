const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  assert = require("node:assert/strict");
const createLoader = require("./loader.cjs");
module.exports = async function () {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "companion-storage-test-"),
  );
  const file = path.join(directory, "store.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      person: { pin: "2468", pinEnabled: true },
      medications: [],
      doses: [],
      alerts: [],
      caregivers: [],
      activityLogs: [],
    }),
  );
  const previous = process.env.COMPANION_DATA_DIR;
  process.env.COMPANION_DATA_DIR = directory;
  try {
    const dbModule = createLoader().load("lib/db.js");
    const db = dbModule.readDB();
    assert.equal(db.person.pin, undefined);
    assert.equal(db.person.pinSetupRequired, false);
    assert.match(db.person.pinHash, /^[a-f0-9]{32}:[a-f0-9]{64}$/);
    dbModule.logAgentActivity(db, "action", "Test", {
      pin: "private",
      nested: { secret: "private", pillPhoto: "private", safe: "kept" },
    });
    assert.equal(db.activityLogs[0].details.pin, undefined);
    assert.equal(db.activityLogs[0].details.nested.secret, undefined);
    assert.equal(db.activityLogs[0].details.nested.safe, "kept");
    const blocked = path.join(
      process.cwd(),
      "public",
      `security-storage-${require("crypto").randomUUID()}`,
    );
    process.env.COMPANION_DATA_DIR = blocked;
    try {
      assert.throws(() => require("../scripts/data-directory.cjs")());
      assert.equal(fs.readdirSync(blocked).length, 0);
    } finally {
      process.env.COMPANION_DATA_DIR = directory;
      fs.rmdirSync(blocked);
    }
    const buildDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "companion-build-test-"),
    );
    const oldBuild = process.env.NEXT_BUILD_DIR;
    process.env.NEXT_BUILD_DIR = buildDirectory;
    try {
      const builds = require("../scripts/build-validation.cjs");
      assert.throws(() => builds.assertCurrentBuild());
      const digest = builds.sourceDigest();
      builds.markBuild(digest);
      assert.doesNotThrow(() => builds.assertCurrentBuild());
      fs.writeFileSync(
        path.join(buildDirectory, "companion-security-build.json"),
        JSON.stringify({
          sourceDigest: "stale",
          nextVersion: require("next/package.json").version,
        }),
      );
      assert.throws(() => builds.assertCurrentBuild());
    } finally {
      if (oldBuild === undefined) delete process.env.NEXT_BUILD_DIR;
      else process.env.NEXT_BUILD_DIR = oldBuild;
    }
    const original = fs.readFileSync(file, "utf8");
    const fail = createLoader({
      fs: {
        ...fs,
        renameSync() {
          throw new Error("Simulated rename failure");
        },
      },
    }).load("lib/db.js");
    assert.throws(() => fail.writeDB(db));
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert(!fs.readdirSync(directory).some((name) => name.endsWith(".tmp")));
    console.log(
      "Storage tests passed: legacy PIN migration, secret redaction, public-directory rejection, stale-build rejection and atomic-write failure preserves the original store.",
    );
  } finally {
    if (previous === undefined) delete process.env.COMPANION_DATA_DIR;
    else process.env.COMPANION_DATA_DIR = previous;
  }
};
