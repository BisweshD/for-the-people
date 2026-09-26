import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  kindForRecord,
  recordFromQuery,
  REPORTABLE_PAGES,
  reportablePageName,
  reportHref,
} from "./report-link";

describe("recordFromQuery", () => {
  test.each([
    ["/people/S000033", "/people/S000033"],
    ["/people/fec-H6CA12345", "/people/fec-H6CA12345"],
    ["/bills/119-hr-1", "/bills/119-hr-1"],
    ["/votes/house-119-1-102", "/votes/house-119-1-102"],
    ["/election", "/election"],
    ["/election/", "/election"],
    ["/people/S000033/", "/people/S000033"],
  ])("accepts the same-site path %s", (raw, path) => {
    expect(recordFromQuery(raw)).toBe(path);
  });

  test.each([
    null,
    "",
    "people/S000033",
    "//evil.example/people",
    "/\\evil.example",
    "https://evil.example/people/S000033",
    "javascript:alert(1)",
    "/people/<script>alert(1)</script>",
    "/people/S000033?x=1",
    "/people/S000033#top",
    "/people/ S000033",
    "/corrections",
    `/${"a".repeat(120)}`,
  ])("rejects %s", (raw) => {
    expect(recordFromQuery(raw)).toBeNull();
  });

  // R2-L1: a crafted path is never shown as "the page you came from".
  test.each([
    "/Senator-Jane-Doe-voted-to-cut-Social-Security",
    "/people/Senator-Jane-Doe-voted-to-cut-Social-Security",
    "/bills/Senator-Jane-Doe-voted-to-cut-Social-Security",
    "/votes/senate-voted-to-cut",
    "/people/S000033/voted-to-cut",
    "/election/voted-to-cut",
    "/people/S00003",
    "/bills/hr-1",
    "/votes/house-119-3-1",
    "/people/../bills/119-hr-1",
    "/people/./S000033",
    "/./election",
    "/../election",
    "/election/..",
    "/election/.",
    "/.",
    "/..",
    "/",
    "/api/ask",
    "/sw.js",
    "/bills/119-hr-1/summary/..",
  ])("rejects the crafted path %s", (raw) => {
    expect(recordFromQuery(raw)).toBeNull();
  });
});

describe("reportable pages", () => {
  test("each is a real static route, named as its own page names itself", () => {
    const app = join(__dirname, "..", "app");
    for (const [path, name] of Object.entries(REPORTABLE_PAGES)) {
      const page = readFileSync(join(app, path.slice(1), "page.tsx"), "utf8");
      expect(page, path).toContain(`title: ${JSON.stringify(name)}`);
      expect(reportablePageName(path)).toBe(name);
      expect(recordFromQuery(path)).toBe(path);
    }
  });

  test("records and unknown paths have no page name", () => {
    expect(reportablePageName("/people/S000033")).toBeNull();
    expect(reportablePageName("/Senator-Jane-Doe")).toBeNull();
    expect(reportablePageName("/corrections")).toBeNull();
  });
});

describe("kindForRecord", () => {
  test.each([
    ["/people/S000033", "person"],
    ["/bills/119-hr-1", "measure"],
    ["/votes/house-119-1-102", "rollCall"],
    ["/election", null],
  ])("%s is %s", (path, kind) => {
    expect(kindForRecord(path)).toBe(kind);
  });
});

describe("reportHref", () => {
  test("carries the page it was opened from", () => {
    expect(reportHref("/people/S000033")).toBe("/corrections?record=%2Fpeople%2FS000033");
  });

  test("pages with nothing to prefill link to the plain form", () => {
    expect(reportHref("/")).toBe("/corrections");
    expect(reportHref("/corrections")).toBe("/corrections");
    expect(reportHref(null)).toBe("/corrections");
    expect(reportHref("/bills/119-hr-1/summary")).toBe("/corrections");
  });
});
