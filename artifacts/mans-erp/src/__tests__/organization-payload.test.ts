import { describe, expect, it } from "vitest";
import { buildOrganizationPayload } from "@/lib/organization-payload";

describe("buildOrganizationPayload", () => {
  it("omits a blank optional email from the outgoing create request", () => {
    const formData = {
      nameAr: "جمعية حداء لتحفيظ القرآن",
      nameEn: "Hadda Quran Memorization Society",
      type: "CHARITY",
      registrationNumber: "",
      email: "",
      phone: "",
      city: "",
    };

    expect(buildOrganizationPayload(formData)).toEqual({
      nameAr: "جمعية حداء لتحفيظ القرآن",
      nameEn: "Hadda Quran Memorization Society",
      type: "CHARITY",
      registrationNumber: "",
      phone: "",
      city: "",
    });
  });

  it("trims and preserves a provided email", () => {
    expect(buildOrganizationPayload({
      nameAr: "جمعية",
      nameEn: "Society",
      type: "CHARITY",
      email: "  office@example.org  ",
    }).email).toBe("office@example.org");
  });
});
