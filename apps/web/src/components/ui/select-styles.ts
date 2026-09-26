/**
 * The select trigger's look, shared by the Radix trigger (`select.tsx`) and the static stand-in that
 * `select-field.tsx` renders until Radix loads, so the swap is invisible.
 */
export const SELECT_TRIGGER_CLASS =
  "group flex min-h-11 w-full items-center justify-between gap-3 rounded-input border border-input bg-paper px-3.5 py-2 text-left text-base leading-snug text-ink transition-[border-color] duration-(--dur-fast) can-hover:border-ink-2 focus-visible:border-ink aria-invalid:border-2 aria-invalid:border-danger data-[placeholder]:text-ink-2 data-[state=open]:border-ink [&>span]:line-clamp-2 [&>span]:min-w-0";

export const SELECT_ICON_CLASS =
  "size-5 shrink-0 text-ink-2 transition-transform duration-(--dur-base) ease-out-soft group-data-[state=open]:rotate-180 motion-reduce:transition-none";
