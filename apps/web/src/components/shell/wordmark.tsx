import { cn } from "@/lib/utils";

/** The supplied people-and-flag emblem paired with the full product name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-extrabold tracking-tight whitespace-nowrap text-[#082b5a] dark:text-ink",
        className,
      )}
    >
      <img
        src="/brand/symbol.png"
        width={44}
        height={36}
        alt=""
        aria-hidden="true"
        className="h-9 w-11 shrink-0 object-contain dark:rounded-control dark:bg-white dark:p-1"
      />
      <span>For The People</span>
    </span>
  );
}
