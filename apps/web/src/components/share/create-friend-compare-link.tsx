"use client";

import { friendCompareFragment, friendCompareFromStances } from "@for-the-people/core/client";
import { Link2, UsersRound } from "lucide-react";
import { useId } from "react";
import { toast } from "@/lib/toast";
import { useVoter } from "@/lib/voter-store";
import { cn } from "@/lib/utils";

/** The link a friend opens: /compare with the voter's answers packed into the fragment. */
export function friendCompareUrl(origin: string, fragment: string): string {
  return `${origin}/compare#${fragment}`;
}

/**
 * CreateFriendCompareLink: builds a /compare link from this device's answers and hands it to the share
 * sheet, or copies it. The answers ride in the URL fragment, which browsers never send to a server.
 */
export function CreateFriendCompareLink({
  className,
  compact = false,
  primary = false,
}: {
  className?: string;
  /** In a toolbar: the privacy note is read to screen readers and shown in the confirmation. */
  compact?: boolean;
  /** The page's main action (the empty /compare page): a full ink button named for what it does. */
  primary?: boolean;
}) {
  const noteId = useId();
  const voter = useVoter();
  const compare = friendCompareFromStances(voter.stances);
  const count = compare.stances.length;
  if (count === 0) return null;

  const link = () => friendCompareUrl(window.location.origin, friendCompareFragment(compare));

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", {
        description:
          "It holds your answers, never sent to our server. Send it to a friend to compare.",
      });
    } catch {
      toast("Could not copy the link.");
    }
  };

  const share = async () => {
    const url = link();
    const text = `Compare your answers with mine on ${count} key ${count === 1 ? "vote" : "votes"}.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Compare with me on For The People", text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy(url);
  };

  return (
    <div className={cn("flex flex-col items-start gap-1.5", compact && "items-stretch", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          primary && "w-full flex-col items-stretch sm:w-auto sm:flex-row sm:items-center",
        )}
      >
        <button
          type="button"
          aria-describedby={noteId}
          onClick={() => void share()}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-hairline bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:bg-accent",
            compact && "w-full px-3 sm:w-auto sm:px-4",
            primary &&
              "h-12 border-ink bg-ink px-6 text-base font-bold text-paper hover:bg-ink/85 active:scale-[0.98]",
          )}
        >
          <UsersRound className="size-4.5" aria-hidden />
          {primary ? "Send to a friend" : "Compare with a friend"}
        </button>
        {primary && (
          <button
            type="button"
            aria-describedby={noteId}
            onClick={() => void copy(link())}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-control border border-hairline bg-paper px-5 text-base font-semibold text-ink transition-colors hover:bg-accent active:scale-[0.98]"
          >
            <Link2 className="size-4.5" aria-hidden />
            Copy link
          </button>
        )}
      </div>
      <p id={noteId} className={compact ? "sr-only" : "max-w-[52ch] text-sm text-ink-3"}>
        The link holds your {count} Yea or Nay {count === 1 ? "answer" : "answers"}. Anyone you send
        it to can see them. It never reaches our server.
      </p>
    </div>
  );
}
