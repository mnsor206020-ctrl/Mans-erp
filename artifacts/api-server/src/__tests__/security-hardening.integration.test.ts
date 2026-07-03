import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (_req: any) => ({ userId: "test-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
}));

vi.mock("@workspace/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: () =>
        new Proxy(
          {},
          { get: () => vi.fn().mockResolvedValue(null) },
        ),
    },
  ),
}));

const ORIGINAL_ENV = { ...process.env };

describe("Security hardening — Helmet, rate limiting, global error handler", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CORS_ALLOWED_ORIGINS = "https://allowed.example.com";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("applies Helmet security headers to responses", async () => {
    const { default: app } = await import("../app");

    const res = await request(app).get("/api/healthz");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-dns-prefetch-control"]).toBeDefined();
  });

  it("rate-limits requests to /api/users/me once the sensitive limit is exceeded", async () => {
    process.env.RATE_LIMIT_SENSITIVE_MAX = "2";
    const { default: app } = await import("../app");

    await request(app).get("/api/users/me");
    await request(app).get("/api/users/me");
    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Too many requests, please try again later" });
  });

  it("does not rate-limit unrelated endpoints under the sensitive limit", async () => {
    process.env.RATE_LIMIT_SENSITIVE_MAX = "1";
    const { default: app } = await import("../app");

    const res1 = await request(app).get("/api/healthz");
    const res2 = await request(app).get("/api/healthz");
    const res3 = await request(app).get("/api/healthz");

    expect(res1.status).not.toBe(429);
    expect(res2.status).not.toBe(429);
    expect(res3.status).not.toBe(429);
  });
});
