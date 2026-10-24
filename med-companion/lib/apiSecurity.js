import { readDB } from "./db";
import { requireCaregiver, requireDevice } from "./auth";

export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const buckets = (globalThis.__companionApiLimits ||= new Map());
export function allowedHost(host) {
  if (typeof host !== "string" || /[\s\\/@]/.test(host)) return false;
  try {
    const url = new URL(`http://${host}`);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const configured =
      process.env.COMPANION_ORIGIN &&
      new URL(process.env.COMPANION_ORIGIN).protocol === "https:" &&
      new URL(process.env.COMPANION_ORIGIN).host === host;
    return local || !!configured;
  } catch {
    return false;
  }
}
export function checkRequest(req) {
  const host = req.headers?.host;
  if (!allowedHost(host))
    throw new ApiError(
      "Unrecognized host. Configure COMPANION_ORIGIN for remote access.",
      403,
    );
  if (req.headers?.["sec-fetch-site"] === "cross-site")
    throw new ApiError("Cross-site requests are not allowed.", 403);
  if (
    process.env.COMPANION_ORIGIN?.startsWith("https://") &&
    new URL(process.env.COMPANION_ORIGIN).host === host &&
    !req.socket?.encrypted
  ) {
    const trusted = [
      "127.0.0.1",
      "::1",
      "::ffff:127.0.0.1",
      ...(process.env.COMPANION_TRUSTED_PROXY_IPS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ];
    if (
      !trusted.includes(req.socket?.remoteAddress) ||
      req.headers?.["x-forwarded-proto"] !== "https"
    )
      throw new ApiError("Use HTTPS to access Companion remotely.", 426);
  }
  const origin = req.headers?.origin;
  if (origin) {
    let matches = false;
    try {
      const url = new URL(origin);
      matches =
        ["http:", "https:"].includes(url.protocol) &&
        url.host === host &&
        (process.env.COMPANION_ORIGIN?.startsWith("https://") &&
        new URL(process.env.COMPANION_ORIGIN).host === host
          ? url.protocol === "https:"
          : true);
    } catch {}
    if (!matches)
      throw new ApiError("Cross-origin requests are not allowed.", 403);
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.body &&
    (typeof req.body !== "object" || Object.keys(req.body).length)
  ) {
    if (
      req.headers?.["content-type"]?.split(";")[0].trim().toLowerCase() !==
      "application/json"
    )
      throw new ApiError("Use application/json for request bodies.", 415);
    if (Array.isArray(req.body)) throw new ApiError("Expected a JSON object.");
  }
  if (Object.values(req.query || {}).some(Array.isArray))
    throw new ApiError("Repeated query parameters are not supported.");
}
function rateLimit(req, key, max, windowMs) {
  const now = Date.now();
  for (const [id, item] of buckets) if (item.until <= now) buckets.delete(id);
  const id = `${req.socket?.remoteAddress || "unknown"}:${key}`;
  if (!buckets.has(id) && buckets.size >= 2000)
    throw new ApiError("Server is busy. Try again later.", 429);
  const item = buckets.get(id) || { count: 0, until: now + windowMs };
  item.count++;
  buckets.set(id, item);
  if (item.count > max)
    throw new ApiError("Too many requests. Try again later.", 429);
}
export function secureApi(
  handler,
  { role = "device", limit = 240, windowMs = 60000, key = role } = {},
) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Vary", "Cookie");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      checkRequest(req);
      rateLimit(req, key, limit, windowMs);
      if (role === "device" && !requireDevice(req, res, (await readDB()))) return;
      if (role === "caregiver" && !requireCaregiver(req, res, (await readDB()))) return;
      return await handler(req, res);
    } catch (error) {
      if (res.headersSent) return;
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 429) res.setHeader("Retry-After", "60");
      if (status === 500) console.error("Companion API request failed.");
      return res.status(status).json({
        error:
          status === 500
            ? "The request could not be completed."
            : error.message,
      });
    }
  };
}
