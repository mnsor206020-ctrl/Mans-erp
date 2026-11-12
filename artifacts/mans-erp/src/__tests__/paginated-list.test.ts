import { describe, expect, it } from "vitest";
import { unwrapPaginatedList } from "../lib/paginated-list";

describe("unwrapPaginatedList", () => {
  it("returns records from a paginated API response", () => {
    const records = [{ id: "bank-1" }, { id: "bank-2" }];
    expect(unwrapPaginatedList({ data: records, total: 2, pageCount: 1 })).toEqual(records);
  });

  it("continues to support list responses that are already arrays", () => {
    const records = [{ code: "SAR" }];
    expect(unwrapPaginatedList(records)).toEqual(records);
  });

  it.each([undefined, null, {}, { data: null }, { data: "invalid" }])(
    "returns an empty list for an absent or malformed response",
    (response) => {
      expect(unwrapPaginatedList(response)).toEqual([]);
    },
  );
});
