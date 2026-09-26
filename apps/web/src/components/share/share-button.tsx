"use client";

import type { ShareCard } from "@for-the-people/core/client";
import { Share } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { shareImagePath } from "@/lib/share";
import { cn } from "@/lib/utils";

/**
 * Shares a ShareCard. Where the browser can share files (most phones), the story image goes straight
 * to the share sheet. Elsewhere a small menu offers "Copy link" and the images to download.
 * The image URL carries only public ids and counts. The menu's code loads on the first tap that needs it.
 */

const ShareMenu = dynamic(
  () => import("@/components/share/share-menu").then((module) => module.ShareMenu),
  { ssr: false },
);

const canShareFiles = (): boolean => {
  if (typeof navigator === "undefined" || !navigator.canShare || !navigator.share) return false;
  try {
    return navigator.canShare({ files: [new File([], "card.png", { type: "image/png" })] });
  } catch {
    return false;
  }
};

async function imageFile(path: string, name: string): Promise<File> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Share image returned ${response.status}`);
  return new File([await response.blob()], name, { type: "image/png" });
}

export function ShareButton({
  card,
  title,
  text,
  href,
  label = "Share",
  iconOnly = false,
  accessibleName,
  className,
}: {
  card: ShareCard;
  title: string;
  /** The line that goes with the image, for example "I match Rep. Jane Doe on 7 of 9 key votes". */
  text: string;
  /** The public page to link to (a profile, a duel, or the ballot page). */
  href: string;
  /** Visible text, or the accessible name when iconOnly. */
  label?: string;
  iconOnly?: boolean;
  /** A fuller accessible name for a visible label (it must contain the visible text). */
  accessibleName?: string;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuUsed, setMenuUsed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openMenu = () => {
    setMenuUsed(true);
    setMenuOpen(true);
  };
  const [busy, setBusy] = useState(false);
  const pending = useRef<Promise<File> | null>(null);
  const fileName = `for-the-people-${card.kind}.png`;
  const storyPath = shareImagePath(card, "story");
  const ogPath = shareImagePath(card, "og");

  /** Starts rendering the story image on press, so the share sheet opens while the tap still counts. */
  const prepare = () => {
    if (!canShareFiles()) return;
    pending.current ??= imageFile(storyPath, fileName);
    pending.current.catch(() => {
      pending.current = null;
    });
  };

  const onClick = async () => {
    if (!canShareFiles()) {
      if (menuOpen) setMenuOpen(false);
      else openMenu();
      return;
    }
    setBusy(true);
    try {
      prepare();
      const file = await pending.current!;
      await navigator.share({ files: [file], title, text });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      openMenu();
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
      toast("Link copied");
    } catch {
      toast("Could not copy the link. Copy it from the address bar instead.");
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onPointerDown={prepare}
        onClick={() => void onClick()}
        aria-label={iconOnly ? label : accessibleName}
        aria-expanded={menuUsed ? menuOpen : undefined}
        aria-busy={busy || undefined}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-control text-sm font-semibold text-ink transition-colors disabled:opacity-60",
          iconOnly
            ? "size-11 rounded-full border border-hairline bg-paper shadow-1 hover:bg-accent"
            : "border border-hairline bg-paper px-4 hover:bg-accent",
          className,
        )}
      >
        <Share className="size-4.5" aria-hidden />
        {!iconOnly && label}
      </button>
      {menuUsed && (
        <ShareMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          anchor={trigger}
          onCopyLink={copyLink}
          ogPath={ogPath}
          storyPath={storyPath}
          fileName={fileName}
          storyFileName={`for-the-people-${card.kind}-story.png`}
        />
      )}
    </>
  );
}
