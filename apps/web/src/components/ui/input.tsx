import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-input border border-input bg-paper px-3 text-base text-ink transition-[border-color] duration-(--dur-fast) placeholder:text-ink-3 focus-visible:border-ink disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-2 aria-invalid:border-2 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
