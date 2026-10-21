import { ECDH } from "crypto";
import { ApiError } from "./apiSecurity";

export function validateSubscription(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.endpoint !== "string" ||
    value.endpoint.length > 4096
  )
    throw new ApiError("Invalid push subscription.");
  let endpoint;
  try {
    endpoint = new URL(value.endpoint);
  } catch {
    throw new ApiError("Invalid push endpoint.");
  }
  const host = endpoint.hostname.toLowerCase();
  const trusted =
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host === "web.push.apple.com" ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (
    !trusted ||
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    (endpoint.port && endpoint.port !== "443") ||
    endpoint.hash
  )
    throw new ApiError(
      "Only supported browser push-service endpoints are accepted.",
    );
  const decode = (text, length) => {
    if (
      typeof text !== "string" ||
      !/^[A-Za-z0-9_-]+={0,2}$/.test(text) ||
      text.length > 128
    )
      throw new ApiError("Invalid push encryption key.");
    const bytes = Buffer.from(text, "base64url");
    if (
      bytes.length !== length ||
      bytes.toString("base64url") !== text.replace(/=+$/, "")
    )
      throw new ApiError("Invalid push encryption key.");
    return bytes;
  };
  const key = decode(value.keys?.p256dh, 65);
  decode(value.keys?.auth, 16);
  try {
    ECDH.convertKey(key, "prime256v1");
  } catch {
    throw new ApiError("Invalid push public key.");
  }
  return {
    endpoint: endpoint.href,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
    expirationTime: null,
  };
}
