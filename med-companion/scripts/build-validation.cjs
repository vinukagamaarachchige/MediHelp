const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sourceDigest() {
  const files = [
    "package.json",
    "package-lock.json",
    "next.config.js",
    "middleware.js",
  ];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file);
      else files.push(file);
    }
  }
  for (const directory of [
    "pages",
    "components",
    "lib",
    "scripts",
    "styles",
    "public",
  ])
    collect(directory);
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file.replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
function markerPath() {
  return path.join(
    process.env.NEXT_BUILD_DIR || ".next",
    "companion-security-build.json",
  );
}
function markBuild(expected) {
  if (sourceDigest() !== expected)
    throw new Error(
      "Sources changed during the build. Run npm run build again.",
    );
  fs.writeFileSync(
    markerPath(),
    JSON.stringify({
      sourceDigest: expected,
      nextVersion: require("next/package.json").version,
    }),
    { mode: 0o600 },
  );
}
function assertCurrentBuild() {
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath(), "utf8"));
  } catch {}
  if (
    !marker ||
    marker.nextVersion !== require("next/package.json").version ||
    marker.sourceDigest !== sourceDigest()
  ) {
    throw new Error(
      "The production build is missing or stale. Run npm run build after the security update before starting Companion.",
    );
  }
}
module.exports = { sourceDigest, markBuild, assertCurrentBuild };
