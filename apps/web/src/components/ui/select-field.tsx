"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";
import { SELECT_ICON_CLASS, SELECT_TRIGGER_CLASS } from "@/components/ui/select-styles";
import { cn } from "@/lib/utils";

/**
 * A labeled select that keeps Radix out of the first load (BRIEF 10.7). The server and the first client
 * render show a static trigger that looks and reads like the real one (same id, role and ARIA), so labels,
 * focus from elsewhere, and layout work before Radix arrives. The real select loads once the browser is idle,
 * or at once when someone opens the stand-in, which then opens as soon as it loads and keeps focus.
 */

type SelectModule = typeof import("@/components/ui/select");

let pending: Promise<SelectModule> | null = null;
const loadSelect = () => (pending ??= import("@/components/ui/select"));

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends Omit<
  React.ComponentProps<"button">,
  "value" | "onChange" | "children" | "type"
> {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder: string;
}

const OPEN_KEYS = new Set(["Enter", " ", "ArrowDown", "ArrowUp"]);

export function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  ...trigger
}: SelectFieldProps) {
  const [select, setSelect] = React.useState<SelectModule | null>(null);
  const [openOnLoad, setOpenOnLoad] = React.useState(false);
  const standIn = React.useRef<HTMLButtonElement>(null);
  /**
   * Whether the stand-in has focus, kept by its own focus and blur events. Checking document.activeElement
   * when the module arrives is not enough: under load, React may commit the swap much later, after a
   * keyboard user has focused the stand-in. Chrome fires blur while removing a focused element, so a blur
   * only counts once the element is still in the page a microtask later.
   */
  const standInFocused = React.useRef(false);

  const load = React.useCallback(() => {
    void loadSelect().then(setSelect);
  }, []);

  React.useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(load, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(load, 200);
    return () => window.clearTimeout(handle);
  }, [load]);

  // A swap while the stand-in has focus moves focus to the real trigger. When the stand-in was opened,
  // Radix takes focus into the list itself and returns it to the trigger on close. A layout effect runs
  // in the same task as the swap, so a key pressed right then cannot land on the page instead.
  React.useLayoutEffect(() => {
    if (!select || !standInFocused.current) return;
    standInFocused.current = false;
    if (!openOnLoad) document.getElementById(trigger.id)?.focus();
  }, [select, openOnLoad, trigger.id]);

  if (!select) {
    const open = () => {
      setOpenOnLoad(true);
      load();
    };
    const label = options.find((option) => option.value === value)?.label;
    return (
      <button
        ref={standIn}
        type="button"
        role="combobox"
        aria-expanded={false}
        aria-controls={`${trigger.id}-options`}
        aria-autocomplete="none"
        data-placeholder={label ? undefined : ""}
        className={cn(SELECT_TRIGGER_CLASS, className)}
        onClick={open}
        onFocus={() => {
          standInFocused.current = true;
        }}
        onBlur={(event) => {
          const node = event.currentTarget;
          queueMicrotask(() => {
            if (node.isConnected) standInFocused.current = false;
          });
        }}
        onKeyDown={(event) => {
          if (!OPEN_KEYS.has(event.key)) return;
          event.preventDefault();
          open();
        }}
        {...trigger}
      >
        <span>{label ?? placeholder}</span>
        <ChevronDown className={SELECT_ICON_CLASS} aria-hidden />
      </button>
    );
  }

  const { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } = select;
  return (
    <Select value={value} onValueChange={onValueChange} defaultOpen={openOnLoad}>
      <SelectTrigger className={className} {...trigger}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
