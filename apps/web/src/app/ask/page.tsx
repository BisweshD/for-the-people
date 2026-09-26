import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AskChatLoader } from "@/components/ask/ask-chat-loader";
import { askSenators, starterSuggestions } from "@/lib/ask-suggestions";
import { usesDemoModel } from "@/server/ask/model";
import { getDeckCards, getMemberIndex } from "@/server/data";

export const metadata: Metadata = {
  title: "Ask For The People",
  description:
    "Ask plain-English questions about how Congress voted. Every answer shows the official record behind it.",
};

export default function AskPage() {
  return (
    // Once a question is asked (the composer docks), the intro folds away and the title becomes a small
    // label, so the question (the answer's heading) and its answer lead the page, not the page's name.
    <div className="group/ask mx-auto flex w-full max-w-3xl flex-col gap-8 has-[[data-ask-composer=sticky]]:gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-ink group-has-[[data-ask-composer=sticky]]/ask:text-sm group-has-[[data-ask-composer=sticky]]/ask:leading-tight group-has-[[data-ask-composer=sticky]]/ask:font-semibold group-has-[[data-ask-composer=sticky]]/ask:tracking-normal group-has-[[data-ask-composer=sticky]]/ask:text-ink-2 md:text-5xl md:group-has-[[data-ask-composer=sticky]]/ask:text-sm">
          Ask For The People
        </h1>
        <p className="max-w-[60ch] text-base text-ink-2 group-has-[[data-ask-composer=sticky]]/ask:hidden md:text-lg">
          Ask how a member voted, what a bill did, or how we count. Answers come from the official
          record, and every fact links to its receipt. We never recommend candidates.
        </p>
      </header>
      <Suspense fallback={<AskSkeleton />}>
        <AskLoader />
      </Suspense>
    </div>
  );
}

/** Reads the environment at request time, so the demo note is right even when a key is added later. */
async function AskLoader() {
  await connection();
  const [cards, members] = await Promise.all([getDeckCards(), getMemberIndex()]);
  return (
    <AskChatLoader
      demo={usesDemoModel()}
      cards={cards}
      // Today (UTC), read after connection(): the fixed rows turn by one each day.
      starters={starterSuggestions(members, cards, new Date().toISOString().slice(0, 10))}
      senators={askSenators(members)}
      skeleton={<AskSkeleton />}
    />
  );
}

/** Mirrors the empty state: the composer with its ink edge, then six record rows. */
function AskSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden>
      <div className="h-[58px] rounded-control border border-ink bg-paper" />
      <div className="mt-10 h-5 w-28 rounded-input bg-paper" />
      <ul className="mt-2 flex flex-col border-t border-hairline">
        {/* Placeholder rows: the widths repeat, so the row's place is its key. */}
        {[208, 176, 200, 216, 232, 216].map((width, index) => (
          <li
            key={index}
            className="flex min-h-16 items-center gap-3 border-b border-hairline py-3"
          >
            <span className="h-10 w-8 rounded-control bg-paper" />
            <span className="ml-12 h-5 rounded-input bg-paper" style={{ width }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
