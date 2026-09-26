"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { SELECT_ICON_CLASS, SELECT_TRIGGER_CLASS } from "@/components/ui/select-styles";
import { typeaheadMatch } from "@/lib/typeahead";
import { cn } from "@/lib/utils";

/**
 * The shared select: Radix Select (keyboard, typeahead, screen-reader roles) in For The People's own style. The
 * trigger is an 8px-radius input, at least 44px tall; the list floats on paper with shadow-3, opens with a short
 * opacity and scale change (instant with reduced motion), and marks the chosen option with a check.
 */

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(SELECT_TRIGGER_CLASS, className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className={SELECT_ICON_CLASS} aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/**
 * Typeahead for the open list. Radix Select has its own, but the production minifier drops the call that
 * stores the search (Radix wraps it in a `@__PURE__` helper), so only single letters ever matched. This runs
 * in the capture phase and keeps the letters typed within a second, so "New Y" reaches New York; a space
 * with nothing typed still selects the option.
 */
function useTypeahead() {
  const search = React.useRef("");
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  return (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === " " && search.current === "") return;
    event.preventDefault();
    event.stopPropagation();
    search.current += event.key;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      search.current = "";
    }, 1000);
    const options = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]:not([data-disabled])'),
    ];
    const current = options.indexOf(document.activeElement as HTMLElement);
    const labels = options.map((option) => option.textContent?.trim() ?? "");
    const next = typeaheadMatch(labels, current, search.current);
    if (next !== current) options[next]?.focus();
  };
}

function SelectContent({
  className,
  children,
  position = "popper",
  onKeyDownCapture,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const typeahead = useTypeahead();
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={6}
        collisionPadding={16}
        onKeyDownCapture={(event) => {
          onKeyDownCapture?.(event);
          if (!event.defaultPrevented) typeahead(event);
        }}
        className={cn(
          "relative z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-hidden rounded-card border border-hairline bg-paper text-ink shadow-3",
          "data-[state=closed]:animate-out data-[state=closed]:duration-(--dur-fast) data-[state=closed]:ease-in-soft data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:duration-(--dur-base) data-[state=open]:ease-out-soft data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-11 items-center justify-center text-ink-2">
          <ChevronUp className="size-4" aria-hidden />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-11 items-center justify-center text-ink-2">
          <ChevronDown className="size-4" aria-hidden />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center gap-3 rounded-control py-2 pr-10 pl-3 text-base text-ink outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:text-ink-3 data-[highlighted]:bg-accent data-[state=checked]:font-bold",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center">
        <Check className="size-4 text-ink" strokeWidth={2.5} aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
