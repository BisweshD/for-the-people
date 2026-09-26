import { describe, expect, test } from "vitest";
import { isYourMember } from "./your-members";

describe("isYourMember", () => {
  const location = { state: "TX", districts: ["TX-37@cd119", "TX-10@cd120"] };
  const member = (state: string, chamber: "house" | "senate", district: number | null) => ({
    state,
    chamber,
    district,
  });

  test("both senators and the House member for this Congress's district", () => {
    expect(isYourMember(member("TX", "senate", null), location)).toBe(true);
    expect(isYourMember(member("TX", "house", 37), location)).toBe(true);
  });

  test("not next year's ballot district, another state, or no saved location", () => {
    expect(isYourMember(member("TX", "house", 10), location)).toBe(false);
    expect(isYourMember(member("OK", "senate", null), location)).toBe(false);
    expect(isYourMember(member("TX", "senate", null), null)).toBe(false);
    // A saved state whose House district is not confirmed still has its senators.
    const stateOnly = { state: "TX", districts: [] };
    expect(isYourMember(member("TX", "house", 37), stateOnly)).toBe(false);
    expect(isYourMember(member("TX", "senate", null), stateOnly)).toBe(true);
  });
});
