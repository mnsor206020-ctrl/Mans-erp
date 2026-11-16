/**
 * The older route tests deliberately use partial Prisma query doubles, not a
 * database. Keep those tests focused on their existing workflow calculations.
 * Transaction/period guards, commit buffering, RBAC and concurrent HTTP writes
 * are exercised WITHOUT this adapter in closed-year.postgres.test.ts.
 */
import { vi } from "vitest";

vi.mock("../../lib/accounting-transaction", async () => {
  const { Router } = await import("express");
  return {
    createAccountingRouter: (domain: string, prisma: unknown) => ({
      router: Router({ mergeParams: domain === "attachments" }), prisma,
    }),
    afterAccountingCommit: () => false,
    inAccountingTransaction: () => false,
    withJournalAccountingState: async (_db: unknown, _org: string, records: unknown[]) => records,
  };
});
