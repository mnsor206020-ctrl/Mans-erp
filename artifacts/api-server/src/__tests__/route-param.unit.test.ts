import { describe, expect, it } from "vitest";
import { routeParam } from "../lib/route-param";

describe("routeParam", () => {
  it("returns a string route value unchanged", () => {
    expect(routeParam("journal-entry-id")).toBe("journal-entry-id");
  });

  it("rejects array route values", () => {
    expect(routeParam(["first", "second"])).toBe("");
  });

  it("rejects a missing route value", () => {
    expect(routeParam(undefined)).toBe("");
    expect(routeParam({}, "id")).toBe("");
  });

  it("reads an own string parameter from the params object", () => {
    expect(routeParam({ id: "journal-entry-id" }, "id")).toBe("journal-entry-id");
  });

  it("rejects array and inherited object parameters", () => {
    const inheritedParams = Object.create({ id: "inherited-id" });

    expect(routeParam({ id: ["first", "second"] }, "id")).toBe("");
    expect(routeParam(inheritedParams, "id")).toBe("");
  });
});
