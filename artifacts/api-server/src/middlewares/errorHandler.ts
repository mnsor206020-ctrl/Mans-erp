import type { ErrorRequestHandler } from "express";
import { logger } from "../lib/logger";

/**
 * Global Express error handler. Must be mounted last (after all routes).
 * Never leaks stack traces or internal error details to the client — those
 * are logged server-side only. Always responds with the standardized
 * `{ error: "..." }` JSON shape expected by this JSON-only API.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error({ err, url: req.originalUrl, method: req.method }, "Unhandled error");

  if (res.headersSent) {
    return;
  }

  res.status(500).json({ error: "Internal server error" });
};
