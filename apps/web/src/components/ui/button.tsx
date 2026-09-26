import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * For The People's button (skill Part 9), not the component library's default.
 * - Three weights that differ without color: primary (`default`) is solid ink with paper text;
 *   secondary (`outline`) is paper with a 3:1 control border; tertiary (`link`) is underlined at rest.
 *   `ghost` is for icon-only closes and quiet toolbar actions.
 * - 44px tall by default (48px `lg` for a page's main action; 40px `sm` for dense desktop toolbars only).
 * - The control radius, the global 2px ink focus outline, and color changes over --dur-fast. Hover is a
 *   mixed shade (never alpha) and only on devices that hover; pressed is a slightly darker fill.
 * - Unavailable: prefer `aria-disabled` with the reason in text nearby. It stays focusable and reads as
 *   a quiet chip with 4.5:1 text, never a faded copy of the real button. Block the click in the handler.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control border font-bold whitespace-nowrap transition-[color,background-color,border-color,text-decoration-color] duration-(--dur-fast) ease-out-soft select-none disabled:cursor-not-allowed aria-disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          "border-ink bg-ink text-paper disabled:border-badge disabled:bg-badge disabled:text-ink-2 aria-disabled:border-badge aria-disabled:bg-badge aria-disabled:text-ink-2 can-hover:border-ink-hover can-hover:bg-ink-hover pressed:border-ink-press pressed:bg-ink-press",
        outline:
          "border-input bg-paper text-ink disabled:border-hairline disabled:text-ink-2 aria-disabled:border-hairline aria-disabled:text-ink-2 aria-expanded:bg-badge aria-pressed:border-ink aria-pressed:bg-badge can-hover:bg-badge pressed:bg-paper-press",
        ghost:
          "border-transparent bg-transparent text-ink disabled:text-ink-2 aria-disabled:text-ink-2 can-hover:bg-badge pressed:bg-paper-press",
        link: "border-transparent bg-transparent text-ink underline decoration-ink-3-graphic decoration-1 underline-offset-4 disabled:text-ink-2 disabled:no-underline aria-disabled:text-ink-2 aria-disabled:no-underline can-hover:decoration-ink pressed:text-ink-2",
      },
      size: {
        default: "h-11 px-5 text-base",
        sm: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
      },
    },
    compoundVariants: [{ variant: "link", className: "px-1" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * `asChild`: render the one child element (a Link, usually) with the button's classes and attributes.
 * A few lines instead of Radix Slot, which added about 2 KB to the first load of every page with a
 * button. React 19 passes `ref` as a prop, so it rides along; the child's own props win on conflict,
 * and class names are merged.
 */
function Slot({ className, children, ...props }: React.ComponentProps<"button">) {
  if (!React.isValidElement<{ className?: string }>(children)) return null;
  return React.cloneElement(children, {
    ...(props as Record<string, unknown>),
    ...children.props,
    className: cn(className, children.props.className),
  });
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
