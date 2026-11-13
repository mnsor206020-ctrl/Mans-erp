/**
 * Real HTTP + Express routers + Prisma + PostgreSQL + database-backed RBAC.
 * Only the external Clerk identity boundary is substituted; no Prisma/query mocks.
 * Run via scripts/test-organization-isolation.mjs. Never uses a project database.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import request from "supertest";
import { prisma } from "@workspace/prisma";

vi.mock("@clerk/express", () => ({
  getAuth: (req: { get: (key: string) => string | undefined }) =>
    ({ userId: req.get("x-test-identity") ?? null }),
}));

import years from "../routes/fiscal-years";
import journals from "../routes/journal-entries";
import reports from "../routes/reports";

const isolated = !!process.env.MANS_ISOLATION_PGROOT;
const a = { org: randomUUID(), fy: randomUUID(), cash: randomUUID(), revenue: randomUUID(), draft: randomUUID(), posted: randomUUID(), identity: "TEST_identity_a", amount: 1700 };
const b = { org: randomUUID(), fy: randomUUID(), cash: randomUUID(), revenue: randomUUID(), draft: randomUUID(), posted: randomUUID(), identity: "TEST_identity_b", amount: 9000 };
const badYearEntry = randomUUID();
const badAccountEntry = randomUUID();
const mixedOwnerEntry = randomUUID();
let server: Server;
const date = new Date("2026-11-13");

function lineData(owner: typeof a, amount: number) {
  return [
    { accountId: owner.cash, lineNumber: 1, debit: amount, credit: 0, debitBase: amount, creditBase: 0 },
    { accountId: owner.revenue, lineNumber: 2, debit: 0, credit: amount, debitBase: 0, creditBase: amount },
  ];
}
function reportCases(owner: typeof a) {
  return [
    `/api/reports/trial-balance?fiscalYearId=${owner.fy}`,
    `/api/reports/balance-sheet?fiscalYearId=${owner.fy}&asOf=2026-12-31`,
    `/api/reports/income-statement?fiscalYearId=${owner.fy}&from=2026-01-01&to=2026-12-31`,
    `/api/reports/account-ledger?accountId=${owner.cash}&from=2026-01-01&to=2026-12-31`,
  ];
}
const yearBody = { nameEn: "TEST new FY", nameAr: "سنة اختبار", startDate: "2027-01-01", endDate: "2027-12-31" };
function journalBody(owner: typeof a) {
  return { fiscalYearId: owner.fy, entryDate: "2026-11-13", type: "MANUAL", currencyCode: "SAR", lines: lineData(owner, 50) };
}

describe.skipIf(!isolated)("API organization isolation with real local PostgreSQL", () => {
  beforeAll(async () => {
    const root = realpathSync(process.env.MANS_ISOLATION_PGROOT!);
    const url = new URL(process.env.DATABASE_URL!);
    if (!root.includes("/.local/organization-isolation-")
      || !existsSync(join(root, "data", "PG_VERSION"))
      || url.pathname !== "/mans_erp_isolation"
      || url.username !== "test_isolation"
      || url.searchParams.get("host") !== join(root, "socket")) {
      throw new Error("Refusing to run outside the runner's disposable PostgreSQL");
    }
    // An empty database is required, not an existing development/TEST schema.
    expect(await prisma.organization.count()).toBe(0);
    const role = await prisma.role.create({ data: { nameEn: "TEST isolated operator", nameAr: "دور اختبار" } });
    for (const [resource, actions] of [
      ["fiscal_years", ["create", "update"]],
      ["journal_entries", ["create", "update", "delete", "approve", "void"]],
    ] as const) {
      for (const action of actions) {
        const permission = await prisma.permission.create({ data: { resource, action } });
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      }
    }
    for (const owner of [a, b]) {
      await prisma.organization.create({ data: { id: owner.org, nameEn: `TEST ${owner.identity}`, nameAr: "منظمة اختبار" } });
      await prisma.user.create({ data: {
        clerkId: owner.identity, email: `${owner.identity}@example.invalid`, organizationId: owner.org,
        userRoles: { create: { roleId: role.id } },
      } });
      await prisma.fiscalYear.create({ data: {
        id: owner.fy, organizationId: owner.org, nameEn: "TEST FY", nameAr: "سنة اختبار",
        startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
      } });
      await prisma.chartOfAccount.createMany({ data: [
        { id: owner.cash, organizationId: owner.org, code: "1000", nameEn: "TEST Cash", nameAr: "نقد اختبار", type: "ASSET", nature: "DEBIT" },
        { id: owner.revenue, organizationId: owner.org, code: "4000", nameEn: "TEST Revenue", nameAr: "إيراد اختبار", type: "REVENUE", nature: "CREDIT" },
      ] });
      for (const [id, status, number] of [
        [owner.draft, "DRAFT", "TEST-DRAFT"],
        [owner.posted, "POSTED", "JE-2026-0001"],
      ] as const) {
        await prisma.journalEntry.create({ data: {
          id, organizationId: owner.org, fiscalYearId: owner.fy, number, status,
          entryDate: date, totalDebit: owner.amount, totalCredit: owner.amount,
          lines: { create: lineData(owner, owner.amount) },
        } });
      }
    }
    await prisma.user.create({ data: {
      clerkId: "TEST_unassigned", email: "TEST_unassigned@example.invalid",
      userRoles: { create: { roleId: role.id } },
    } });
    await prisma.user.create({ data: {
      clerkId: "TEST_no_permissions", email: "TEST_no_permissions@example.invalid", organizationId: a.org,
    } });
    // Deliberately inconsistent legacy-style links, in this disposable DB ONLY.
    for (const [id, entryOwner, accountOwner, amount] of [
      [badYearEntry, a, a, 101], [mixedOwnerEntry, a, b, 202], [badAccountEntry, b, a, 303],
    ] as const) {
      await prisma.journalEntry.create({ data: {
        id, organizationId: entryOwner.org, fiscalYearId: b.fy, number: `TEST-BAD-${amount}`,
        status: "POSTED", entryDate: date, totalDebit: amount, totalCredit: amount,
        lines: { create: lineData(accountOwner, amount) },
      } });
    }
    const app = express();
    app.use(express.json());
    app.use("/api/fiscal-years", years);
    app.use("/api/journal-entries", journals);
    app.use("/api/reports", reports);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
  }, 30_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await prisma.$disconnect();
    // The runner stops/removes the entire temporary cluster; never deletes rows
    // by a TEST prefix and never connects to either existing project database.
  });

  for (const [own, foreign] of [[a, b], [b, a]]) {
    describe(`identity ${own.identity}`, () => {
      it("lists only its own fiscal years even with a forged organization query", async () => {
        const res = await request(server).get("/api/fiscal-years").query({ organizationId: foreign.org }).set("x-test-identity", own.identity);
        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body.every((fy: { organizationId: string }) => fy.organizationId === own.org)).toBe(true);
      });
      it("rejects foreign fiscal-year creation without inserting a record", async () => {
        const before = await prisma.fiscalYear.count();
        const res = await request(server).post("/api/fiscal-years").set("x-test-identity", own.identity).send({ ...yearBody, organizationId: foreign.org });
        expect(res.status).toBe(403);
        expect(await prisma.fiscalYear.count()).toBe(before);
      });
      it("allows same-organization fiscal-year creation without a client organizationId", async () => {
        const res = await request(server).post("/api/fiscal-years").set("x-test-identity", own.identity).send(yearBody);
        expect(res.status).toBe(201);
        expect((await prisma.fiscalYear.findUniqueOrThrow({ where: { id: res.body.id } })).organizationId).toBe(own.org);
      });
      it("rejects another organization's draft on read, update, delete and workflow actions", async () => {
        expect((await request(server).get(`/api/journal-entries/${foreign.draft}`).set("x-test-identity", own.identity)).status).toBe(404);
        expect((await request(server).patch(`/api/journal-entries/${foreign.draft}`).set("x-test-identity", own.identity).send({ descriptionEn: "TEST forbidden" })).status).toBe(404);
        expect((await request(server).delete(`/api/journal-entries/${foreign.draft}`).set("x-test-identity", own.identity)).status).toBe(404);
        for (const action of ["submit", "approve", "post", "reverse", "copy", "void"]) {
          expect((await request(server).post(`/api/journal-entries/${foreign.draft}/${action}`).set("x-test-identity", own.identity).send({})).status).toBe(404);
        }
        expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: foreign.draft } })).status).toBe("DRAFT");
      });
      it("refuses a foreign fiscal year before any draft header or lines are changed", async () => {
        const before = await prisma.journalEntry.findUniqueOrThrow({ where: { id: own.draft }, include: { lines: true } });
        const res = await request(server).patch(`/api/journal-entries/${own.draft}`).set("x-test-identity", own.identity)
          .send({ fiscalYearId: foreign.fy, descriptionEn: "TEST forbidden", lines: lineData(own, 75) });
        expect(res.status).toBe(400);
        expect(await prisma.journalEntry.findUniqueOrThrow({ where: { id: own.draft }, include: { lines: true } })).toEqual(before);
      });
      it("refuses foreign accounts on create and update without inserting or replacing lines", async () => {
        const before = await prisma.journalEntry.count();
        const original = await prisma.journalEntryLine.findMany({ where: { journalEntryId: own.draft }, orderBy: { lineNumber: "asc" } });
        expect((await request(server).post("/api/journal-entries").set("x-test-identity", own.identity)
          .send({ ...journalBody(own), lines: lineData(foreign, 50) })).status).toBe(400);
        expect((await request(server).patch(`/api/journal-entries/${own.draft}`).set("x-test-identity", own.identity)
          .send({ lines: lineData(foreign, 50) })).status).toBe(400);
        expect(await prisma.journalEntry.count()).toBe(before);
        expect(await prisma.journalEntryLine.findMany({ where: { journalEntryId: own.draft }, orderBy: { lineNumber: "asc" } })).toEqual(original);
      });
      it("refuses a foreign fiscal year during creation without inserting a draft", async () => {
        const before = await prisma.journalEntry.count();
        const res = await request(server).post("/api/journal-entries").set("x-test-identity", own.identity)
          .send({ ...journalBody(own), fiscalYearId: foreign.fy });
        expect(res.status).toBe(400);
        expect(await prisma.journalEntry.count()).toBe(before);
      });
      it("keeps same-organization journal creation and editing available", async () => {
        const created = await request(server).post("/api/journal-entries").set("x-test-identity", own.identity).send(journalBody(own));
        expect(created.status).toBe(201);
        expect(created.body.organizationId).toBe(own.org);
        const edited = await request(server).patch(`/api/journal-entries/${created.body.id}`).set("x-test-identity", own.identity)
          .send({ fiscalYearId: own.fy, descriptionEn: "TEST allowed update", lines: lineData(own, 60) });
        expect(edited.status).toBe(200);
        expect(edited.body).toMatchObject({ fiscalYearId: own.fy, descriptionEn: "TEST allowed update" });
      });
      for (const [index, path] of reportCases(own).entries()) {
        it(`report ${index + 1} includes only its own ${own.amount} despite corrupt foreign links`, async () => {
          const res = await request(server).get(path).set("x-test-identity", own.identity);
          expect(res.status).toBe(200);
          if (index === 0) expect(res.body).toMatchObject({ totalDebit: own.amount, totalCredit: own.amount });
          if (index === 1) expect(res.body).toMatchObject({ totalAssets: own.amount, totalEquity: own.amount, isBalanced: true });
          if (index === 2) expect(res.body).toMatchObject({ totalRevenue: own.amount, totalExpenses: 0, netIncome: own.amount });
          if (index === 3) expect(res.body).toMatchObject({ beginningBalance: 0, totalDebit: own.amount, totalCredit: 0, endingBalance: own.amount });
        });
      }
      for (const path of reportCases(foreign)) {
        it(`refuses foreign report identifier: ${path.split("?")[0]}`, async () => {
          expect((await request(server).get(path).set("x-test-identity", own.identity)).status).toBe(404);
        });
      }
      it("does not expose foreign or inconsistent entries in the list", async () => {
        const res = await request(server).get("/api/journal-entries").set("x-test-identity", own.identity);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
        expect(res.body.data.every((entry: { organizationId: string }) => entry.organizationId === own.org)).toBe(true);
        expect(res.body.data.map((entry: { id: string }) => entry.id)).not.toEqual(expect.arrayContaining([badYearEntry]));
        expect(res.body.data.map((entry: { id: string }) => entry.id)).not.toContain(badAccountEntry);
        expect(res.body.data.map((entry: { id: string }) => entry.id)).not.toContain(mixedOwnerEntry);
      });
      it("rejects closing or rolling over another organization's year", async () => {
        for (const action of ["close", "rollover"]) {
          expect((await request(server).post(`/api/fiscal-years/${foreign.fy}/${action}`)
            .set("x-test-identity", own.identity).send({ retainedEarningsAccountId: own.revenue })).status).toBe(404);
        }
      });
    });
  }

  for (const path of ["/api/fiscal-years", "/api/journal-entries", `/api/journal-entries/${a.draft}`, ...reportCases(a)]) {
    it(`blocks unassigned users and unauthenticated requests: ${path.split("?")[0]}`, async () => {
      expect((await request(server).get(path).set("x-test-identity", "TEST_unassigned")).status).toBe(400);
      expect((await request(server).get(path)).status).toBe(401);
    });
  }
  it("blocks unassigned users with explicit permissions from financial mutations", async () => {
    expect((await request(server).post("/api/fiscal-years").set("x-test-identity", "TEST_unassigned")
      .send({ ...yearBody, organizationId: a.org })).status).toBe(400);
    expect((await request(server).post("/api/journal-entries").set("x-test-identity", "TEST_unassigned").send(journalBody(a))).status).toBe(400);
    expect((await request(server).patch(`/api/journal-entries/${a.draft}`).set("x-test-identity", "TEST_unassigned").send({ descriptionEn: "TEST" })).status).toBe(400);
    for (const action of ["submit", "approve", "post", "reverse", "copy", "void"]) {
      expect((await request(server).post(`/api/journal-entries/${a.draft}/${action}`).set("x-test-identity", "TEST_unassigned").send({})).status).toBe(400);
    }
  });
  it("preserves RBAC rejection for an organization member without grants", async () => {
    expect((await request(server).post("/api/fiscal-years").set("x-test-identity", "TEST_no_permissions").send(yearBody)).status).toBe(403);
    expect((await request(server).post("/api/journal-entries").set("x-test-identity", "TEST_no_permissions").send(journalBody(a))).status).toBe(403);
    expect((await request(server).patch(`/api/journal-entries/${a.draft}`).set("x-test-identity", "TEST_no_permissions").send({ descriptionEn: "TEST" })).status).toBe(403);
  });
  it("rejects legacy inconsistent year/account links before exposing or operating on them", async () => {
    for (const [id, identity] of [[badYearEntry, a.identity], [mixedOwnerEntry, a.identity], [badAccountEntry, b.identity]]) {
      expect((await request(server).get(`/api/journal-entries/${id}`).set("x-test-identity", identity)).status).toBe(404);
      expect((await request(server).post(`/api/journal-entries/${id}/post`).set("x-test-identity", identity).send({})).status).toBe(404);
    }
  });
});
