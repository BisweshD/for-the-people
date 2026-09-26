import type * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * A badge labels something; it is never a control (skill Parts 5 and 10). So it is round (full radius),
 * quietly filled, and never solid ink: solid ink with the control radius means "button or selected".
 * - `neutral`: the quiet default ("Key vote", "Senate", "3 votes").
 * - `you`: the voter's own thing, on soft marigold ("You", "Your member").
 * - `agree` and `split`: a status. It must carry an icon, so the meaning never rests on color alone.
 * Text is 14px (the floor for anything that informs) and at least 4.5:1 on every fill in both themes.
 */
const badgeVariants = cva(
  "inline-flex w-fit max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 type-meta font-bold [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-badge text-ink-2",
        you: "bg-you-soft text-ink",
        agree: "bg-agree-soft text-ink [&_svg]:text-agree",
        split: "bg-split-soft text-ink [&_svg]:text-split",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type BadgeProps = Omit<React.ComponentProps<"span">, "children"> & {
  children: React.ReactNode;
} & (
    | { tone?: "neutral" | "you"; icon?: React.ReactNode }
    | { tone: "agree" | "split"; icon: React.ReactNode }
  );

function Badge({ className, tone = "neutral", icon, children, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
