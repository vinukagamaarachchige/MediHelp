// The app targets the patched Node 24 LTS line. The optional Windows fallback
// is an app-local portable runtime; it does not change the system Node install.
module.exports = function requireSupportedRuntime() {
  if (process.env.COMPANION_ORIGIN) {
    const origin = new URL(process.env.COMPANION_ORIGIN);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (
      (!local && origin.protocol !== "https:") ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error(
        "COMPANION_ORIGIN must be an HTTPS origin without credentials, a path or a query.",
      );
  }
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major === 24 && minor >= 22) return;
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const fs = require("fs");
    const path = require("path");
    const binary = path.join(
      process.env.LOCALAPPDATA,
      "Companion",
      "runtimes",
      "node-v24.22.0-win-x64",
      "node.exe",
    );
    if (fs.existsSync(binary)) {
      // Published by https://nodejs.org/dist/v24.22.0/SHASUMS256.txt
      const actual = require("crypto")
        .createHash("sha256")
        .update(fs.readFileSync(binary))
        .digest("hex");
      if (
        actual !==
        "ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c"
      )
        throw new Error(
          "App-local Node runtime checksum mismatch. Refusing to execute it.",
        );
      const result = require("child_process").spawnSync(
        binary,
        [process.argv[1], ...process.argv.slice(2)],
        { stdio: "inherit", windowsHide: true, env: process.env },
      );
      if (result.error)
        throw new Error("The verified app-local Node runtime could not start.");
      process.exit(result.status ?? 1);
    }
  }
  throw new Error(
    "Use Node 24.22.0 or a newer patched Node 24 LTS release to build or start Companion.",
  );
};
