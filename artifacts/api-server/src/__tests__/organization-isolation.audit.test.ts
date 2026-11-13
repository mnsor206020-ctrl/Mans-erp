/**
 * Read-only security audit of the real routers with an IN-MEMORY Prisma double.
 * Never imports the live Prisma client or writes to either development database.
 * it.fails cases document confirmed missing guards, NOT completed security fixes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { userRolesGrantingAll } from "./helpers/rbac";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  fiscalYear: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  chartOfAccount: { findFirst: vi.fn() },
  journalEntry: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  journalEntryLine: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("@workspace/prisma", () => ({ prisma: db }));
vi.mock("@clerk/express", () => ({
  getAuth: (req: { headers: Record<string, string | undefined> }) => ({
    userId: req.headers["x-test-identity"] ?? null,
  }),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../routes/journal-entry-attachments", async () => {
  const { Router } = await import("express");
  return { default: Router() };
});
vi.mock("../services/notification", () => ({ notificationService: { emit: vi.fn() } }));

import reports from "../routes/reports";
import fiscalYearsRouter from "../routes/fiscal-years";
import journals from "../routes/journal-entries";

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const FY_A = "20000000-0000-4000-8000-000000000001";
const FY_B = "20000000-0000-4000-8000-000000000002";
const ENTRY_A = "30000000-0000-4000-8000-000000000001";
const ENTRY_B = "30000000-0000-4000-8000-000000000002";
const CASH_A = "40000000-0000-4000-8000-000000000001";
const CASH_B = "40000000-0000-4000-8000-000000000002";

type Account = {
  id: string; code: string; organizationId: string; nameEn: string; nameAr: string;
  type: string; nature: string; deletedAt: null;
};
type Entry = {
  id: string; organizationId: string; fiscalYearId: string; number: string;
  status: string; entryDate: Date; deletedAt: null; exchangeRate: string;
  descriptionEn: null; descriptionAr: null; reference: null;
};
type Where = {
  id?: string; organizationId?: string | null; fiscalYearId?: string;
  deletedAt?: null; status?: string | { in: string[] };
  accountId?: string;
  account?: Where & { type?: { in: string[] } };
  journalEntry?: Where;
  entryDate?: { lt?: Date; gte?: Date; lte?: Date };
};
const cashA: Account = {
  id: CASH_A, code: "1000", organizationId: A, nameEn: "TEST Cash A", nameAr: "نقد اختباري أ",
  type: "ASSET", nature: "DEBIT", deletedAt: null,
};
const cashB = { ...cashA, id: CASH_B, organizationId: B, nameEn: "TEST Cash B" };
const revenueA = { ...cashA, id: "revenue-a", code: "4000", type: "REVENUE", nature: "CREDIT" };
const revenueB = { ...revenueA, id: "revenue-b", organizationId: B };
const accounts = [cashA, cashB, revenueA, revenueB];
const fiscalYears = [
  { id: FY_A, organizationId: A, deletedAt: null, status: "OPEN" },
  { id: FY_B, organizationId: B, deletedAt: null, status: "OPEN" },
];
let entries: Entry[];
type Line = {
  accountId: string; journalEntryId: string; account: Account; journalEntry: Entry;
  lineNumber: number; debit: string; credit: string;
};
let lines: Line[];

function matches(row: { id: string; organizationId: string | null; deletedAt: null }, where: Where) {
  return (!where.id || row.id === where.id)
    && (where.organizationId === undefined || row.organizationId === where.organizationId);
}

const app = express();
app.use(express.json());
app.use("/reports", reports);
app.use("/fiscal-years", fiscalYearsRouter);
app.use("/journal-entries", journals);

beforeEach(() => {
  vi.resetAllMocks();
  entries = [
    { id: ENTRY_A, organizationId: A, fiscalYearId: FY_A, number: "JE-2026-0001", status: "POSTED" },
    { id: ENTRY_B, organizationId: B, fiscalYearId: FY_B, number: "JE-2026-0001", status: "POSTED" },
  ].map((entry) => ({
    ...entry, entryDate: new Date("2026-11-13"), deletedAt: null, exchangeRate: "1",
    descriptionEn: null, descriptionAr: null, reference: null,
  }));
  lines = entries.flatMap((entry, i) => {
    const amount = i === 0 ? "1700" : "9000";
    const debit = i === 0 ? cashA : cashB;
    const credit = i === 0 ? revenueA : revenueB;
    return [
      { account: debit, debit: amount, credit: "0" },
      { account: credit, debit: "0", credit: amount },
    ].map((line, index) => ({
      ...line, accountId: line.account.id, journalEntryId: entry.id,
      journalEntry: entry, lineNumber: index + 1,
    }));
  });
  db.user.findFirst.mockImplementation(({ where }: { where: { clerkId: string } }) =>
    Promise.resolve(["a", "b", "unassigned"].includes(where.clerkId) ? {
      id: `test-user-${where.clerkId}`, clerkId: where.clerkId, email: "test@example.invalid",
      organizationId: where.clerkId === "a" ? A : where.clerkId === "b" ? B : null,
      userRoles: userRolesGrantingAll("journal_entries", "fiscal_years"),
    } : null),
  );
  db.fiscalYear.findFirst.mockImplementation(({ where }: { where: Where }) =>
    Promise.resolve(fiscalYears.find((year) => matches(year, where)) ?? null),
  );
  db.fiscalYear.findMany.mockImplementation(({ where }: { where: Where }) =>
    Promise.resolve(fiscalYears.filter((year) => matches(year, where))),
  );
  db.fiscalYear.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "created-in-memory-only", ...data }),
  );
  db.chartOfAccount.findFirst.mockImplementation(({ where }: { where: Where }) =>
    Promise.resolve(accounts.find((account) => matches(account, where)) ?? null),
  );
  db.journalEntry.findFirst.mockImplementation(({ where }: { where: Where }) =>
    Promise.resolve(entries.find((entry) => matches(entry, where)) ?? null),
  );
  const matchingEntries = (where: Where) => entries.filter((entry) =>
    matches(entry, where) && (!where.fiscalYearId || entry.fiscalYearId === where.fiscalYearId));
  db.journalEntry.findMany.mockImplementation(({ where }: { where: Where }) =>
    Promise.resolve(matchingEntries(where)));
  db.journalEntry.count.mockImplementation(({ where }: { where: Where }) =>
    Promise.resolve(matchingEntries(where).length));
  db.journalEntry.update.mockImplementation(({ where, data }: {
    where: { id: string }; data: Partial<Entry>;
  }) => {
    const entry = entries.find((candidate) => candidate.id === where.id)!;
    Object.assign(entry, data);
    return Promise.resolve(entry);
  });
  db.auditLog.create.mockResolvedValue({});
  db.journalEntryLine.findMany.mockImplementation(({ where }: { where: Where }) =>
    Promise.resolve(lines.filter((line) => {
      const je = where.journalEntry ?? {};
      const entry = line.journalEntry;
      if (where.accountId && where.accountId !== line.accountId) return false;
      if (where.account?.organizationId && where.account.organizationId !== line.account.organizationId) return false;
      if (where.account?.type && !where.account.type.in.includes(line.account.type)) return false;
      if (je.organizationId && je.organizationId !== entry.organizationId) return false;
      if (je.fiscalYearId && je.fiscalYearId !== entry.fiscalYearId) return false;
      if (typeof je.status === "object" && !je.status.in.includes(entry.status)) return false;
      if (je.entryDate?.lt && entry.entryDate >= je.entryDate.lt) return false;
      if (je.entryDate?.gte && entry.entryDate < je.entryDate.gte) return false;
      if (je.entryDate?.lte && entry.entryDate > je.entryDate.lte) return false;
      return true;
    })),
  );
});

function reportCases(year: string, account: string) {
  return [
    { name: "trial balance", path: "/trial-balance", query: { fiscalYearId: year } },
    { name: "balance sheet", path: "/balance-sheet", query: { fiscalYearId: year, asOf: "2026-12-31" } },
    { name: "income statement", path: "/income-statement", query: { fiscalYearId: year, from: "2026-01-01", to: "2026-12-31" } },
    { name: "ledger", path: "/account-ledger", query: { accountId: account, from: "2026-01-01", to: "2026-12-31" } },
  ];
}

describe("report isolation with consistent two-organization fixtures", () => {
  for (const identity of ["a", "b"]) {
    const year = identity === "a" ? FY_A : FY_B;
    const account = identity === "a" ? CASH_A : CASH_B;
    const amount = identity === "a" ? 1700 : 9000;
    for (const scenario of reportCases(year, account)) {
      it(`${scenario.name} contains only organization ${identity}'s amounts`, async () => {
        const res = await request(app).get(`/reports${scenario.path}`)
          .set("x-test-identity", identity).query(scenario.query);
        expect(res.status).toBe(200);
        if (scenario.path === "/trial-balance") {
          expect(res.body).toMatchObject({ totalDebit: amount, totalCredit: amount });
          expect(res.body.lines).toHaveLength(2);
        } else if (scenario.path === "/balance-sheet") {
          expect(res.body).toMatchObject({ totalAssets: amount, totalEquity: amount, isBalanced: true });
        } else if (scenario.path === "/income-statement") {
          expect(res.body).toMatchObject({ totalRevenue: amount, totalExpenses: 0, netIncome: amount });
        } else {
          expect(res.body).toMatchObject({ beginningBalance: 0, totalDebit: amount, endingBalance: amount });
          expect(res.body.lines).toHaveLength(1);
        }
      });
    }
  }
  for (const scenario of reportCases(FY_B, CASH_B)) {
    it(`${scenario.name} refuses another organization's identifier before loading lines`, async () => {
      const res = await request(app).get(`/reports${scenario.path}`)
        .set("x-test-identity", "a").query(scenario.query);
      expect(res.status).toBe(404);
      expect(db.journalEntryLine.findMany).not.toHaveBeenCalled();
    });
    it(`${scenario.name} refuses a user with no organization`, async () => {
      const res = await request(app).get(`/reports${scenario.path}`)
        .set("x-test-identity", "unassigned").query(scenario.query);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("User has no organization");
      expect(db.fiscalYear.findFirst).not.toHaveBeenCalled();
      expect(db.chartOfAccount.findFirst).not.toHaveBeenCalled();
      expect(db.journalEntryLine.findMany).not.toHaveBeenCalled();
    });
    it(`${scenario.name} refuses missing authentication`, async () => {
      const res = await request(app).get(`/reports${scenario.path}`).query(scenario.query);
      expect(res.status).toBe(401);
      expect(db.user.findFirst).not.toHaveBeenCalled();
    });
  }
});

describe("journal and fiscal-year read boundaries", () => {
  it("the same journal number in two organizations does not mix list results", async () => {
    const res = await request(app).get("/journal-entries").set("x-test-identity", "a")
      .query({ search: "JE-2026-0001" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data.map((entry: Entry) => entry.id)).toEqual([ENTRY_A]);
  });
  it("journal detail refuses the other organization's entry UUID", async () => {
    const res = await request(app).get(`/journal-entries/${ENTRY_B}`).set("x-test-identity", "a");
    expect(res.status).toBe(404);
  });
  it("a scoped user's fiscal-year list includes only their organization", async () => {
    const res = await request(app).get("/fiscal-years").set("x-test-identity", "a");
    expect(res.status).toBe(200);
    expect(res.body.map((year: { id: string }) => year.id)).toEqual([FY_A]);
  });
});

describe("CONFIRMED SECURITY GAPS — current behavior reproduced without live database access", () => {
  it("documents both organizations' fiscal years returned to an unassigned non-platform user", async () => {
    const res = await request(app).get("/fiscal-years").set("x-test-identity", "unassigned");
    expect(res.status).toBe(200);
    expect(res.body.map((year: { id: string }) => year.id)).toEqual([FY_A, FY_B]);
  });
  it("documents foreign-organization fiscal-year creation with a scoped create permission", async () => {
    const res = await request(app).post("/fiscal-years").set("x-test-identity", "a").send({
      organizationId: B, nameEn: "TEST foreign year", nameAr: "اختبار سنة أجنبية",
      startDate: "2027-01-01", endDate: "2027-12-31",
    });
    expect(res.status).toBe(201);
    expect(db.fiscalYear.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: B }),
    }));
  });
  it("documents an owned draft accepting another organization's fiscal year", async () => {
    entries[0]!.status = "DRAFT";
    const res = await request(app).patch(`/journal-entries/${ENTRY_A}`)
      .set("x-test-identity", "a").send({ fiscalYearId: FY_B });
    expect(res.status).toBe(200);
    expect(db.fiscalYear.findFirst).not.toHaveBeenCalled();
    expect(entries[0]!.fiscalYearId).toBe(FY_B);
  });
  it("documents trial balance including foreign entries with inconsistent fiscal-year linkage", async () => {
    // A conditional fixture, NOT an assertion that the live TEST data are corrupt.
    // The real PATCH route above permits creating this foreign-year linkage on a draft.
    entries[0]!.fiscalYearId = FY_B;
    const res = await request(app).get("/reports/trial-balance")
      .set("x-test-identity", "b").query({ fiscalYearId: FY_B });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalDebit: 10700, totalCredit: 10700 });
  });
});

describe("PENDING SECURITY FIXES — four explicit expected failures, not isolation guarantees", () => {
  it.fails("must deny fiscal-year listing for a user without an organization", async () => {
    const res = await request(app).get("/fiscal-years").set("x-test-identity", "unassigned");
    expect([400, 403]).toContain(res.status);
    expect(db.fiscalYear.findMany).not.toHaveBeenCalled();
  });
  it.fails("must refuse a foreign organization on fiscal-year creation", async () => {
    const res = await request(app).post("/fiscal-years").set("x-test-identity", "a").send({
      organizationId: B, nameEn: "TEST foreign year", nameAr: "اختبار سنة أجنبية",
      startDate: "2027-01-01", endDate: "2027-12-31",
    });
    expect([400, 403, 404]).toContain(res.status);
    expect(db.fiscalYear.create).not.toHaveBeenCalled();
  });
  it.fails("must refuse a foreign fiscal year on draft update", async () => {
    entries[0]!.status = "DRAFT";
    const res = await request(app).patch(`/journal-entries/${ENTRY_A}`)
      .set("x-test-identity", "a").send({ fiscalYearId: FY_B });
    expect([400, 403, 404]).toContain(res.status);
    expect(db.journalEntry.update).not.toHaveBeenCalled();
  });
  it.fails("must exclude foreign journal entries from trial balance despite inconsistent linkage", async () => {
    entries[0]!.fiscalYearId = FY_B;
    const res = await request(app).get("/reports/trial-balance")
      .set("x-test-identity", "b").query({ fiscalYearId: FY_B });
    expect(res.status).toBe(200);
    expect(res.body.totalDebit).toBe(9000);
    expect(res.body.totalCredit).toBe(9000);
  });
});
