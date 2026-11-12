import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { ChartImportRow } from "@workspace/api-zod";
import { validateChartImport, type ExistingImportAccount } from "../lib/chart-import";
import { userRolesGrantingAll } from "./helpers/rbac";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), findMany: vi.fn(), transaction: vi.fn(), create: vi.fn(), lock: vi.fn(), audit: vi.fn(),
}));
vi.mock("@clerk/express", () => ({ getAuth: () => ({ userId: "test-clerk" }) }));
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.user },
    chartOfAccount: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));
import router from "../routes/chart-import";

const org = "aaaaaaaa-0000-0000-0000-000000000001";
const user = { id: "user-1", organizationId: org, userRoles: userRolesGrantingAll("chart_of_accounts") };
const row = (code: string, parentCode = "", extra: Partial<ChartImportRow> = {}): ChartImportRow => ({
  rowNumber: 2, code, parentCode, name: "حساب", type: "ASSET", nature: "DEBIT", ...extra,
});
const existingParent = (extra: Partial<ExistingImportAccount> = {}): ExistingImportAccount => ({
  id: "parent", code: "old", level: 3, type: "ASSET", isGroup: true, isActive: true, deletedAt: null, ...extra,
});
const app = express();
app.use(express.json());
app.use("/api/chart-of-accounts/import", router);
let existing: ExistingImportAccount[];
let committed: Record<string, unknown>[];
let failCreate: boolean;
const send = (rows: ChartImportRow[], confirm = false) =>
  request(app).post("/api/chart-of-accounts/import").send({ rows, confirm });

beforeEach(() => {
  vi.resetAllMocks();
  existing = [];
  committed = [];
  failCreate = false;
  mocks.user.mockResolvedValue(user);
  mocks.findMany.mockImplementation(async () => existing);
  mocks.lock.mockResolvedValue([]);
  mocks.audit.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (callback) => {
    const staged: Record<string, unknown>[] = [];
    mocks.create.mockImplementation(async ({ data }) => {
      if (failCreate && staged.length === 1) throw new Error("simulated database failure");
      const created = { ...data, id: `created-${staged.length}`, deletedAt: null, isActive: true };
      staged.push(created);
      return created;
    });
    const result = await callback({
      $queryRaw: mocks.lock,
      chartOfAccount: { findMany: mocks.findMany, create: mocks.create },
      auditLog: { create: mocks.audit },
    });
    committed.push(...staged);
    existing.push(...staged as unknown as ExistingImportAccount[]);
    return result;
  });
});

describe("Chart import — validation and hierarchy", () => {
  it("previews unordered multi-level Arabic/English accounts without writes", async () => {
    const res = await send([
      row("001-x", "A.9", { rowNumber: 2, nameAr: "الصندوق", nameEn: "Cash Box", notes: "وصف" }),
      row("A.9", "root", { rowNumber: 3 }),
      row("root", "", { rowNumber: 4 }),
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: true, total: 3, mainAccounts: 1, subaccounts: 2, imported: 0 });
    expect(res.body.rows.map((r: { code: string }) => r.code)).toEqual(["root", "A.9", "001-x"]);
    expect(res.body.rows[2]).toMatchObject({ level: 3, nameAr: "الصندوق", nameEn: "Cash Box", notes: "وصف", isGroup: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { organizationId: org } });
  });
  it("has no fixed hierarchy depth or numeric code convention", () => {
    const rows = Array.from({ length: 600 }, (_, i) => row(`node-${i}`, i ? `node-${i - 1}` : ""));
    const result = validateChartImport(rows.reverse(), []);
    expect(result.valid).toBe(true);
    expect(result.rows[599].level).toBe(600);
  });
  it("uses a single English or Arabic name for both language fields", () => {
    expect(validateChartImport([row("en", "", { name: "English" }), row("ar", "", { name: "عربي" })], []).rows)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ nameAr: "English", nameEn: "English" }),
        expect.objectContaining({ nameAr: "عربي", nameEn: "عربي" }),
      ]));
  });
  it("rejects duplicate codes on every duplicate row", async () => {
    const res = await send([row("same"), row("same", "", { rowNumber: 3 })], true);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.filter((e: { message: string }) => e.message.includes("مكرر"))).toHaveLength(2);
    expect(committed).toHaveLength(0);
  });
  it("rejects missing parents and leaves the database unchanged", async () => {
    const res = await send([row("child", "missing")], true);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors[0].message).toContain("الأب غير موجود");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects invalid type, nature, code and missing names", () => {
    const result = validateChartImport([row("", "", { name: "", type: "UNKNOWN", nature: "INVALID" })], []);
    expect(result.errors).toHaveLength(4);
  });
  it("rejects cycles without recursing forever", () => {
    const result = validateChartImport([row("one", "two"), row("two", "one")], []);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
  it("rejects conflicts with live or archived accounts", async () => {
    existing = [existingParent(), existingParent({ code: "archived", deletedAt: new Date() })];
    const res = await send([row("old"), row("archived")], true);
    expect(res.body.errors).toHaveLength(2);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("allows active existing groups as parents but never modifies them", async () => {
    existing = [existingParent()];
    const res = await send([row("new", "old")], true);
    expect(res.body.imported).toBe(1);
    expect(committed[0]).toMatchObject({ parentId: "parent", level: 4, organizationId: org });
    expect(existing[0]).toEqual(existingParent());
  });
  it("rejects existing posting parents, inactive parents and type mismatch", () => {
    for (const parent of [
      existingParent({ isGroup: false }),
      existingParent({ isActive: false }),
      existingParent({ type: "REVENUE" }),
    ]) expect(validateChartImport([row("new", "old")], [parent]).valid).toBe(false);
  });
});

describe("Chart import — transactional and permission safety", () => {
  it("commits the full hierarchy with proper group flags and parent IDs", async () => {
    const res = await send([row("child", "root"), row("root")], true);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(committed).toHaveLength(2);
    expect(committed[0]).toMatchObject({ code: "root", parentId: null, isGroup: true, allowDirectEntry: false });
    expect(committed[1]).toMatchObject({ parentId: "created-0", isGroup: false, allowDirectEntry: true, level: 2 });
    expect(mocks.lock).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60000, isolationLevel: "Serializable" });
  });
  it("rolls back all staged accounts when a later create fails", async () => {
    failCreate = true;
    const res = await send([row("root"), row("child", "root")], true);
    expect(res.status).toBe(500);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(committed).toEqual([]);
    expect(existing).toEqual([]);
  });
  it("revalidates changed accounts at confirmation and prevents double importing", async () => {
    expect((await send([row("same")])).body.valid).toBe(true);
    expect((await send([row("same")], true)).body.imported).toBe(1);
    expect((await send([row("same")], true)).body.valid).toBe(false);
    expect(committed).toHaveLength(1);
  });
  it("requires create permission", async () => {
    mocks.user.mockResolvedValue({ ...user, userRoles: [] });
    expect((await send([row("root")], true)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires the caller's own organization even for a permitted user", async () => {
    mocks.user.mockResolvedValue({ ...user, organizationId: null });
    expect((await send([row("root")], true)).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("rejects malformed requests before touching accounting data", async () => {
    const res = await request(app).post("/api/chart-of-accounts/import").send({ rows: [], confirm: true });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
