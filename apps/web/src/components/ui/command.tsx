"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "@/lib/utils";
import { SearchIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** shadcn Command (cmdk), restyled with For The People tokens: paper surface, hairlines, 20 px radius, 44 px rows. */

const SELECTED_ITEM = '[cmdk-item][aria-selected="true"]';

/**
 * cmdk remembers the selected option's id when the selection changes, so when options remount under
 * the same value (every keystroke re-ranks them) its `aria-activedescendant` points at an element that
 * no longer exists. This keeps the input and the list pointing at the option that is actually
 * selected, from the moment the list opens.
 */
function useActiveDescendant(root: React.RefObject<HTMLDivElement | null>) {
  React.useEffect(() => {
    const element = root.current;
    if (!element) return;
    const sync = () => {
      const id = element.querySelector(SELECTED_ITEM)?.id ?? null;
      for (const owner of element.querySelectorAll("[cmdk-input], [cmdk-list]")) {
        if (id === null) {
          if (owner.hasAttribute("aria-activedescendant"))
            owner.removeAttribute("aria-activedescendant");
        } else if (owner.getAttribute("aria-activedescendant") !== id) {
          owner.setAttribute("aria-activedescendant", id);
        }
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-selected", "aria-activedescendant", "id"],
    });
    return () => observer.disconnect();
  }, [root]);
}

function resultMessage(root: HTMLElement): string {
  const input = root.querySelector<HTMLInputElement>("[cmdk-input]");
  if (!input || input.value.trim() === "") return "";
  if (root.querySelector("[cmdk-loading]")) return "Loading results";
  const count = root.querySelectorAll('[cmdk-item]:not([aria-disabled="true"])').length;
  return count === 0 ? "No results" : `${count} ${count === 1 ? "result" : "results"}`;
}

/**
 * A polite status that says how many options match what was typed, so a screen reader hears the
 * result count without leaving the input. It waits for typing to pause before it speaks.
 */
function CommandResultCount({ root }: { root: React.RefObject<HTMLDivElement | null> }) {
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    const element = root.current;
    if (!element) return;
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(resultMessage(element)), 350);
    };
    const observer = new MutationObserver(update);
    observer.observe(element.querySelector("[cmdk-list]") ?? element, {
      subtree: true,
      childList: true,
    });
    element.addEventListener("input", update);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      element.removeEventListener("input", update);
    };
  }, [root]);
  return (
    <p role="status" className="sr-only">
      {message}
    </p>
  );
}

function Command({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  const root = React.useRef<HTMLDivElement>(null);
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      root.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  useActiveDescendant(root);
  return (
    <CommandPrimitive
      ref={setRef}
      data-slot="command"
      className={cn("flex size-full flex-col overflow-hidden bg-paper text-ink", className)}
      {...props}
    >
      {children}
      <CommandResultCount root={root} />
    </CommandPrimitive>
  );
}

function CommandDialog({
  title = "Search",
  description = "Search for a person, bill, district, or page.",
  children,
  className,
  showCloseButton = false,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn(
          "top-2 max-w-[calc(100%-1rem)] translate-y-0 gap-0 overflow-hidden rounded-card bg-paper p-0 shadow-4 ring-1 ring-hairline sm:top-[12vh] sm:max-w-xl",
          className,
        )}
        showCloseButton={showCloseButton}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex items-center gap-3 border-b border-hairline px-4"
    >
      <SearchIcon className="size-5 shrink-0 text-ink-3" aria-hidden />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-14 w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-ink-2",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[min(62dvh,460px)] scroll-py-2 overflow-x-hidden overflow-y-auto overscroll-contain p-2 outline-none",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("px-4 py-8 text-center text-base text-ink-2", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden pb-1 text-ink **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:text-sm **:[[cmdk-group-heading]]:font-bold **:[[cmdk-group-heading]]:text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("mx-2 my-1 h-px bg-hairline", className)}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2.5 py-2 text-base text-ink outline-none select-none data-selected:bg-accent data-disabled:pointer-events-none data-disabled:text-ink-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto text-sm text-ink-3", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
