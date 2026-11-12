import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJournalEntry, updateJournalEntry, submitJournalEntry,
  approveJournalEntry, postJournalEntry,
} from "@workspace/api-client-react";

// Mock HTTP only: these tests never create or post real accounting entries.
afterEach(() => vi.unstubAllGlobals());

const payload = {
  fiscalYearId: "test-year", entryDate: "2026-11-13",
  descriptionEn: "قيد تجريبي / Test entry", type: "MANUAL" as const,
  currencyCode: "SAR", exchangeRate: 1,
  lines: [
    { accountId: "cash", lineNumber: 1, debit: 1500, credit: 0 },
    { accountId: "revenue", lineNumber: 2, debit: 0, credit: 1500 },
  ],
};
function mockResponse(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Journal entry request contracts", () => {
  it("creates a draft with the actual JSON body, including a mixed-language description", async () => {
    const fetch = mockResponse({ id: "test-entry", status: "DRAFT" });
    await expect(createJournalEntry(payload)).resolves.toMatchObject({ status: "DRAFT" });
    expect(fetch.mock.calls[0][0]).toBe("/api/journal-entries");
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload);
  });
  it("edits using PATCH without losing lines or descriptions", async () => {
    const fetch = mockResponse({ id: "test-entry", ...payload });
    await updateJournalEntry("test-entry", payload);
    expect(fetch.mock.calls[0][0]).toBe("/api/journal-entries/test-entry");
    expect(fetch.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload);
  });
  it.each([
    ["submit", submitJournalEntry], ["approve", approveJournalEntry],
  ] as const)("keeps the %s comment contract", async (action, send) => {
    const fetch = mockResponse({ id: "test-entry" });
    await send("test-entry", { comment: "تجريبي" });
    expect(fetch.mock.calls[0][0]).toBe(`/api/journal-entries/test-entry/${action}`);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ comment: "تجريبي" });
  });
  it("posts an approved entry without introducing a payload contract", async () => {
    const fetch = mockResponse({ id: "test-entry", status: "POSTED" });
    await expect(postJournalEntry("test-entry")).resolves.toMatchObject({ status: "POSTED" });
    expect(fetch.mock.calls[0][0]).toBe("/api/journal-entries/test-entry/post");
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });
  it.each([400, 403, 500])("exposes the server's %s failure without treating it as success", async (status) => {
    mockResponse({ error: "رفض العملية التجريبية" }, status);
    await expect(createJournalEntry(payload)).rejects.toMatchObject({
      status, data: { error: "رفض العملية التجريبية" },
    });
  });
});
