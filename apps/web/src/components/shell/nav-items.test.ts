import { describe, expect, test } from "vitest";
import { isActive, isTopLinkActive, NAV_ITEMS, TOP_LINKS } from "./nav-items";

const activeTop = (pathname: string) =>
  TOP_LINKS.filter((link) => isTopLinkActive(link, pathname)).map((link) => link.label);
const activeTab = (pathname: string) =>
  NAV_ITEMS.filter((item) => isActive(item, pathname)).map((item) => item.label);

describe("navigation", () => {
  test("a member's profile highlights no tab", () => {
    expect(activeTop("/people/S000033")).toEqual([]);
    expect(activeTab("/people/S000033")).toEqual([]);
  });

  test("sections keep their tab", () => {
    expect(activeTop("/explore")).toEqual(["Explore"]);
    expect(activeTop("/bills/119-hr-1")).toEqual(["Explore"]);
    expect(activeTop("/votes/119-house-2025-190")).toEqual(["Explore"]);
    expect(activeTop("/compare")).toEqual(["Matches"]);
    expect(activeTop("/matches")).toEqual(["Matches"]);
    expect(activeTop("/duel")).toEqual(["Explore"]);
    // Phones have no Explore or Matches tab: Matches and a friend link sit under Swipe.
    expect(activeTab("/matches")).toEqual(["Swipe"]);
    expect(activeTab("/compare")).toEqual(["Swipe"]);
    expect(activeTab("/explore")).toEqual([]);
    expect(activeTab("/duel")).toEqual([]);
    expect(activeTab("/bills/119-hr-1")).toEqual([]);
    expect(activeTab("/votes/119-house-2025-190")).toEqual([]);
    // Desktop has room for the election hub's own link; on phones it sits under Ballot.
    expect(activeTop("/election")).toEqual(["Election"]);
    expect(activeTab("/election")).toEqual(["Ballot"]);
    expect(activeTab("/ballot/cheat-sheet")).toEqual(["Ballot"]);
  });

  test("the trust pages light no tab", () => {
    for (const path of ["/methodology", "/sources", "/changelog", "/status", "/corrections"]) {
      expect(activeTop(path)).toEqual([]);
      expect(activeTab(path)).toEqual([]);
    }
  });

  test("a prefix alone is not a section", () => {
    expect(activeTop("/asking")).toEqual([]);
    expect(activeTab("/matchesx")).toEqual([]);
    expect(activeTab("/elections")).toEqual([]);
  });

  test("the phone tabs are the brief's five, in order", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(["Home", "Swipe", "Ballot", "Ask", "You"]);
  });
});
