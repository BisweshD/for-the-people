import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { METHOD_RECEIPTS } from "./methods";

describe("method receipts", () => {
  test("every method receipt points at a section that exists on /methodology", () => {
    const page = readFileSync(join(import.meta.dirname, "../app/methodology/page.tsx"), "utf8");
    const ids = new Set([...page.matchAll(/\bid="([a-z-]+)"/g)].map((match) => match[1]));
    const missing = Object.entries(METHOD_RECEIPTS)
      .filter(([, method]) => !ids.has(method.anchor))
      .map(([id, method]) => `${id} -> #${method.anchor}`);
    expect(missing).toEqual([]);
  });
});
