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

describe("CORS allowlist behavior", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("allows a request whose Origin is in CORS_ALLOWED_ORIGINS", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://allowed.example.com,https://other-allowed.example.com";
    const { default: app } = await import("../app");

    const res = await request(app)
      .get("/api/healthz")
      .set("Origin", "https://allowed.example.com");

    expect(res.headers["access-control-allow-origin"]).toBe("https://allowed.example.com");
  });

  it("rejects a request whose Origin is not in CORS_ALLOWED_ORIGINS", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://allowed.example.com";
    const { default: app } = await import("../app");

    const res = await request(app)
      .get("/api/healthz")
      .set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows requests with no Origin header (server-to-server / curl)", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://allowed.example.com";
    const { default: app } = await import("../app");

    const res = await request(app).get("/api/healthz");

    expect(res.status).toBe(200);
  });

  it("supports multiple comma-separated origins", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://a.example.com, https://b.example.com";
    const { default: app } = await import("../app");

    const resA = await request(app).get("/api/healthz").set("Origin", "https://a.example.com");
    const resB = await request(app).get("/api/healthz").set("Origin", "https://b.example.com");

    expect(resA.headers["access-control-allow-origin"]).toBe("https://a.example.com");
    expect(resB.headers["access-control-allow-origin"]).toBe("https://b.example.com");
  });

  it("falls back to the Replit dev domain for local development when the env var is unset", async () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.REPLIT_DEV_DOMAIN = "my-repl.replit.dev";
    const { default: app } = await import("../app");

    const res = await request(app)
      .get("/api/healthz")
      .set("Origin", "https://my-repl.replit.dev");

    expect(res.headers["access-control-allow-origin"]).toBe("https://my-repl.replit.dev");
  });
});
