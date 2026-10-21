const fs = require("fs");
const path = require("path");
module.exports = function dataDirectory() {
  const directory = path.resolve(
    process.env.COMPANION_DATA_DIR || path.join(process.cwd(), "data"),
  );
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const actual = fs.realpathSync(directory);
  for (const root of [
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), process.env.NEXT_BUILD_DIR || ".next", "static"),
  ]) {
    const base = fs.existsSync(root)
      ? fs.realpathSync(root)
      : path.resolve(root);
    const relative = path.relative(base, actual);
    if (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    ) {
      throw new Error(
        "Private data cannot be stored in a publicly served directory.",
      );
    }
  }
  return actual;
};
