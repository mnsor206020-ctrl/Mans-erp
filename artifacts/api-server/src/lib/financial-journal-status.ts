/**
 * Already-recognized entries retain their financial effect after reversal or
 * legacy locking. A draft reversal is excluded until it is actually posted.
 */
export function financialJournalStatusFilter() {
  return { in: ["POSTED", "REVERSED", "LOCKED"] as Array<"POSTED" | "REVERSED" | "LOCKED"> };
}
