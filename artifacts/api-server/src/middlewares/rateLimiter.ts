import rateLimit from "express-rate-limit";

/**
 * General-purpose limiter applied to every /api request. Generous defaults
 * so normal ERP usage (list/detail screens, dashboards) is never throttled,
 * while still capping abusive/scripted traffic.
 */
export const generalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_GENERAL_WINDOW_MS ?? 15 * 60 * 1000),
  limit:    Number(process.env.RATE_LIMIT_GENERAL_MAX ?? 600),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests, please try again later" },
});

/**
 * Stricter limiter for authentication-sensitive / identity endpoints
 * (e.g. /api/users/me) where brute-forcing or scraping is highest risk.
 */
export const sensitiveLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_SENSITIVE_WINDOW_MS ?? 15 * 60 * 1000),
  limit:    Number(process.env.RATE_LIMIT_SENSITIVE_MAX ?? 60),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests, please try again later" },
});

/**
 * Limiter for write operations (POST/PUT/PATCH/DELETE) to slow down
 * scripted abuse of mutating endpoints (creating records, uploads, etc.).
 */
export const writeLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WRITE_WINDOW_MS ?? 15 * 60 * 1000),
  limit:    Number(process.env.RATE_LIMIT_WRITE_MAX ?? 200),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests, please try again later" },
  skip: (req) => !["POST", "PUT", "PATCH", "DELETE"].includes(req.method),
});
