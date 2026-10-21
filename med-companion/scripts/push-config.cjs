const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const webpush = require("web-push");

module.exports = function pushConfig() {
  const file = path.join(require("./data-directory.cjs")(), "push-keys.json");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) {
    const keys = {
      ...webpush.generateVAPIDKeys(),
      secret: crypto.randomBytes(32).toString("hex"),
    };
    try {
      fs.writeFileSync(file, JSON.stringify(keys), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  const keys = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!!process.env.VAPID_PUBLIC_KEY !== !!process.env.VAPID_PRIVATE_KEY)
    throw new Error("Configure both VAPID keys together.");
  if (process.env.REMINDER_SECRET && process.env.REMINDER_SECRET.length < 32)
    throw new Error("REMINDER_SECRET must be at least 32 characters.");
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY || keys.publicKey,
    privateKey: process.env.VAPID_PRIVATE_KEY || keys.privateKey,
    subject: process.env.VAPID_SUBJECT || "https://localhost",
    secret: process.env.REMINDER_SECRET || keys.secret,
  };
};
