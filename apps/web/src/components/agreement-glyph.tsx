import type { ReactNode } from "react";
import { Oval } from "@/components/oval";
import { cn } from "@/lib/utils";

/**
 * The one agree/split marker, used everywhere two sides are compared:
 * agree is a filled agree-tone oval with a check, split a hollow oval with a slash. The shape carries the meaning,
 * the PRGn color supports it, and text always sits beside it.
 */

/**
 * Just the oval, for a row of markers that carries one summary label, or with `label` as its own
 * screen-reader text.
 */
export function AgreementOval({
  agree,
  size = 20,
  label,
}: {
  agree: boolean;
  size?: number;
  label?: string;
}) {
  return (
    <Oval
      filled={agree}
      tone={agree ? "agree" : "split"}
      slashed={!agree}
      checked={agree}
      size={size}
      stroke={2.25}
      animate={false}
      label={label}
    />
  );
}

/** The oval with its text: "Agree" or "Split" unless the caller words it ("Same side", "Split: 93"). */
export function AgreementGlyph({
  agree,
  children,
  size = 20,
  className,
}: {
  agree: boolean;
  children?: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-sm font-semibold text-ink", className)}
    >
      <AgreementOval agree={agree} size={size} />
      <span>{children ?? (agree ? "Agree" : "Split")}</span>
    </span>
  );
}
