"use client";

import { Download, Link2 } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

/**
 * The fallback share menu (Copy link, Download image, Download for stories). Loaded on the first tap
 * that needs it, so pages with share buttons do not ship a popover library up front.
 */
export function ShareMenu({
  open,
  onOpenChange,
  anchor,
  onCopyLink,
  ogPath,
  storyPath,
  fileName,
  storyFileName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  onCopyLink: () => void;
  ogPath: string;
  storyPath: string;
  fileName: string;
  storyFileName: string;
}) {
  const itemClass =
    "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-[15px] font-semibold text-ink hover:bg-accent focus-visible:bg-accent";
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={anchor as React.RefObject<HTMLButtonElement>} />
      <PopoverContent
        aria-label="Share options"
        align="end"
        className="w-64 gap-1 rounded-card border border-hairline bg-paper p-2 shadow-3 ring-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          anchor.current?.focus();
        }}
      >
        <button type="button" className={itemClass} onClick={onCopyLink}>
          <Link2 className="size-4.5 text-ink-2" aria-hidden />
          Copy link
        </button>
        <a
          className={itemClass}
          href={ogPath}
          download={fileName}
          onClick={() => onOpenChange(false)}
        >
          <Download className="size-4.5 text-ink-2" aria-hidden />
          Download image
        </a>
        <a
          className={itemClass}
          href={storyPath}
          download={storyFileName}
          onClick={() => onOpenChange(false)}
        >
          <Download className="size-4.5 text-ink-2" aria-hidden />
          Download for stories
        </a>
      </PopoverContent>
    </Popover>
  );
}
