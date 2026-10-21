(async () => {
  await require("./safety.cjs")();
  await require("./security.cjs")();
  await require("./storage.cjs")();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
