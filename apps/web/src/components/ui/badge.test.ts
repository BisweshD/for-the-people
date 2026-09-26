import { describe, expect, test } from "vitest";
import { badgeVariants } from "./badge";
import { buttonVariants } from "./button";

const TONES = ["neutral", "you", "agree", "split"] as const;

describe("badges never look like buttons", () => {
  test.each(TONES)("the %s badge is round, quietly filled, and at the 14px floor", (tone) => {
    const classes = badgeVariants({ tone }).split(" ");
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("type-meta");
    expect(classes).not.toContain("bg-ink");
    expect(classes.some((name) => name.startsWith("rounded-control"))).toBe(false);
  });

  test("a status badge colors its icon, not only its fill", () => {
    expect(badgeVariants({ tone: "agree" })).toContain("[&_svg]:text-agree");
    expect(badgeVariants({ tone: "split" })).toContain("[&_svg]:text-split");
  });
});

describe("buttons", () => {
  test("every size is a real touch target (40px only for dense desktop toolbars)", () => {
    expect(buttonVariants({ size: "default" })).toContain("h-11");
    expect(buttonVariants({ size: "lg" })).toContain("h-12");
    expect(buttonVariants({ size: "icon" })).toContain("size-11");
    expect(buttonVariants({ size: "sm" })).toContain("h-10");
  });

  test.each(["default", "outline", "ghost", "link"] as const)(
    "the %s button keeps the global focus outline and never fades out",
    (variant) => {
      const classes = buttonVariants({ variant });
      expect(classes).toContain("rounded-control");
      expect(classes).not.toMatch(/outline-none|opacity-50|ring-ring/);
    },
  );

  test("the tertiary button is underlined at rest", () => {
    expect(buttonVariants({ variant: "link" }).split(" ")).toContain("underline");
  });
});
