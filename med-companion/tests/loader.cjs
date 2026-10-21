const fs = require("fs"),
  path = require("path"),
  vm = require("vm");
const { transformSync } = require("next/dist/build/swc");
module.exports = function createLoader(mocks = {}) {
  const cache = {};
  const context = vm.createContext({
    console,
    process,
    Date,
    Math,
    Number,
    JSON,
    Buffer,
    URL,
    AbortSignal,
    setTimeout,
    clearTimeout,
  });
  function load(file) {
    file = path.resolve(file);
    if (Object.hasOwn(mocks, file)) return mocks[file];
    if (cache[file]) return cache[file].exports;
    if (file.endsWith(".cjs")) return require(file);
    const module = { exports: {} };
    cache[file] = module;
    const source = transformSync(fs.readFileSync(file, "utf8"), {
      filename: file,
      jsc: { parser: { syntax: "ecmascript" }, target: "es2020" },
      module: { type: "commonjs" },
    }).code;
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context)(
      (name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        return name.startsWith(".")
          ? load(
              path.resolve(
                path.dirname(file),
                path.extname(name) ? name : name + ".js",
              ),
            )
          : require(name);
      },
      module,
      module.exports,
    );
    return module.exports;
  }
  return {
    load,
    mock(file, value) {
      mocks[path.resolve(file)] = value;
    },
  };
};
module.exports.response = () => ({
  code: 200,
  headers: {},
  body: null,
  status(n) {
    this.code = n;
    return this;
  },
  json(b) {
    this.body = b;
    return this;
  },
  end() {
    return this;
  },
  setHeader(k, v) {
    this.headers[k] = v;
  },
  getHeader(k) {
    return this.headers[k];
  },
});
module.exports.request = (method = "GET", body, extra = {}) => ({
  method,
  body,
  query: {},
  socket: { remoteAddress: "127.0.0.1" },
  headers: {
    host: "localhost:3000",
    ...(body ? { "content-type": "application/json" } : {}),
  },
  ...extra,
});
module.exports.cookies = (res) =>
  (res.headers["Set-Cookie"] || [])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
