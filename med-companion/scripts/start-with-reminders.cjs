const { loadEnvConfig } = require("@next/env");
const { spawn } = require("child_process");
loadEnvConfig(process.cwd());
require("./runtime.cjs")();
require("./build-validation.cjs").assertCurrentBuild();
const config = require("./push-config.cjs")();
const port = process.env.PORT || "3000";
const server = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "-H",
    process.env.HOSTNAME_BIND || "127.0.0.1",
    "-p",
    port,
  ],
  { stdio: "inherit", windowsHide: true, env: process.env },
);
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/reminders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.secret}` },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok)
      console.error(`Reminder job failed (${response.status}).`);
  } catch (error) {
    if (error.cause?.code !== "ECONNREFUSED")
      console.error("Reminder job could not reach the server.");
  } finally {
    running = false;
  }
}
const timer = setInterval(tick, 30000);
server.on("error", () => {
  clearInterval(timer);
  console.error("Companion server failed to start.");
  process.exitCode = 1;
});
server.on("exit", (code) => {
  clearInterval(timer);
  process.exitCode = code || 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    server.kill(signal);
  });
