const { spawn } = require("child_process");
const command = process.argv[2];
require("@next/env").loadEnvConfig(process.cwd(), command === "dev");
require("./runtime.cjs")();
if (!["dev", "build", "start"].includes(command))
  throw new Error("Unknown Next command.");
const builds = require("./build-validation.cjs");
if (command === "start") builds.assertCurrentBuild();
const digest = command === "build" ? builds.sourceDigest() : null;
const args = [require.resolve("next/dist/bin/next"), command];
if (command !== "build")
  args.push("-H", process.env.HOSTNAME_BIND || "127.0.0.1");
args.push(...process.argv.slice(3));
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", () => {
  console.error("Companion failed to start.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  if (code === 0 && command === "build") {
    try {
      builds.markBuild(digest);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
  }
  process.exitCode = code || 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
