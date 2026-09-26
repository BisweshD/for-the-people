"use client";

import { DEFAULT_WEIGHT, type Choice, type Weight } from "@for-the-people/core/client";
import { Undo2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Oval } from "@/components/oval";
import { CardReceipt } from "@/components/swipe/card-receipt";
import { KeyVoteCard } from "@/components/swipe/key-vote-card";
import { MILESTONE_ANSWERS, MIN_RANKED } from "@/components/swipe/thresholds";
import { ProgressOvals } from "@/components/swipe/progress-ovals";
import { CareToggle } from "@/components/swipe/weight-picker";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import type { CardView } from "@/lib/views";
import { useVoter, voterActions } from "@/lib/voter-store";

/**
 * Swipe your stance. The card follows the finger with up to ±8° of
 * rotation and commits past 35% of its width or on a quick flick; the chosen oval floods with ink,
 * and the next vote, waiting underneath, lifts into place as the card leaves. Keyboard: ← Nay,
 * → Yea, ↓ Skip, 1-3 sets how much it matters. At the fifth Yea or Nay answer the deck pauses once,
 * in place, to offer the matches.
 *
 * Built on pointer events and the Web Animations API rather than an animation library, so the home
 * page and the deck stay inside the first-load JavaScript budget. The lean
 * toward a side lives in CSS variables (--lean-yea, --lean-nay) on the deck, which the answer ovals
 * and the drag labels read without re-rendering React.
 */

const COMMIT_SHARE = 0.35;
const FLICK_VELOCITY = 0.55; // px per ms
const MAX_ROTATION = 8;
const FILL_BEFORE_EXIT_MS = 260;
const EXIT_MS = 256;
const SNAP_BACK_MS = 380;
const EASE_IN = "cubic-bezier(0.64, 0, 0.78, 0)";
/** A spring-like settle: overshoots slightly, then comes to rest (spring.snappy). */
const EASE_SNAP = "cubic-bezier(0.2, 1.35, 0.35, 1)";

type Side = "Yea" | "Nay";

// What shows a ranking appears only after answers saved on this device (never in server HTML), so it
// and the scoring code load after the page: the first vote costs no extra JavaScript.
const ClosestStrip = dynamic(
  () => import("@/components/swipe/closest-strip").then((module) => module.ClosestStrip),
  { ssr: false },
);

// "Ask about this bill" and its chat code load the first time someone opens it.
const TalkSheet = dynamic(
  () => import("@/components/swipe/talk-sheet").then((module) => module.TalkSheet),
  { ssr: false },
);

type Moments = typeof import("@/components/swipe/journey-moments");
/** The pause and completion cards, once loaded (shared by every deck on the page). */
let loadedMoments: Moments | null = null;

/**
 * Loads the pause and completion cards ahead of need, so the fifth answer or the last one renders
 * them on the same frame instead of after a chunk request (a lazy component would show a blank beat).
 */
function useMoments(wanted: boolean): Moments | null {
  const [moments, setMoments] = useState(loadedMoments);
  useEffect(() => {
    if (!wanted || moments) return;
    let live = true;
    import("@/components/swipe/journey-moments").then(
      (module) => {
        loadedMoments = module;
        if (live) setMoments(module);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [wanted, moments]);
  return moments;
}

interface DeckProps {
  cards: CardView[];
  /** "hero" shows one live card on the home page and continues on /swipe after the first answer. */
  variant: "page" | "hero";
  /** A model is configured, so each vote offers "Ask about this bill" (the server decides). */
  talk?: boolean;
}

/** The oval is 95% full at the commit point; the last bit of ink lands when the answer commits. */
const FILL_AT_COMMIT = 0.95;

function setLean(deck: HTMLElement | null, lean: number) {
  if (!deck) return;
  deck.style.setProperty("--lean-yea", String(Math.max(0, lean) * FILL_AT_COMMIT));
  deck.style.setProperty("--lean-nay", String(Math.max(0, -lean) * FILL_AT_COMMIT));
}

export function SwipeDeck({ cards, variant, talk = false }: DeckProps) {
  const voter = useVoter();
  const router = useRouter();
  const reduce = useReducedMotion();
  const answered = useMemo(
    () => new Map(voter.stances.map((stance) => [stance.keyVoteId, stance])),
    [voter.stances],
  );
  const decidedCount = [...answered.values()].filter(
    (stance) => stance.choice === "Yea" || stance.choice === "Nay",
  ).length;
  const queue = cards.filter((card) => !answered.has(card.id));
  const current = queue[0] ?? null;
  const next = queue[1] ?? null;
  const [weight, setWeight] = useState<Weight>(DEFAULT_WEIGHT);
  const [pending, setPending] = useState<Choice | null>(null);
  /** False until the first answer here, so the first card does not animate in on page load. */
  const [advanced, setAdvanced] = useState(false);
  /** The next vote lifted into place as the last one left, so it needs no entrance of its own. */
  const [promoted, setPromoted] = useState(false);
  /** Read out after each answer, so screen-reader users hear what was recorded and what comes next. */
  const [announcement, setAnnouncement] = useState("");
  /** The key vote just answered: its progress oval pops as it fills. */
  const [popId, setPopId] = useState<string | null>(null);
  /** The one pause at the fifth Yea or Nay answer (Milestone), in place of the next vote. */
  const [milestone, setMilestone] = useState(false);
  const milestoneSeen = useRef(false);
  const lastAnswered = useRef<string | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const underRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const barEndRef = useRef<HTMLDivElement>(null);
  const hasCurrent = current !== null;
  const [talkOpen, setTalkOpen] = useState(false);
  const [talkUsed, setTalkUsed] = useState(false);
  /** An answer chosen in "Ask about this bill", recorded once the sheet has closed. */
  const chosen = useRef<{ choice: Choice; weight: Weight | null } | null>(null);

  // From tablets up the tray is sticky, so a long ballot never pushes the answers below the fold.
  // While it is pinned it floats (full border and a shadow); a marker just under its natural place
  // says when that is. The attribute is set on the element, so scrolling never re-renders the deck.
  useEffect(() => {
    const bar = barRef.current;
    const end = barEndRef.current;
    if (!bar || !end) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const below = !entry.isIntersecting && entry.boundingClientRect.top > 0;
        bar.toggleAttribute("data-stuck", below);
      },
      { rootMargin: "0px 0px -12px 0px" },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasCurrent, milestone]);

  const moments = useMoments(variant === "page" || answered.size > 0);

  const commit = useCallback(
    (choice: Choice, weightOverride: Weight | null = null) => {
      if (!current || pending) return;
      setPending(choice);
      const card = cardRef.current;
      const under = underRef.current;
      const direction = choice === "Yea" ? 1 : choice === "Nay" ? -1 : 0;
      const finish = () => {
        voterActions.recordStance(current.id, choice, weightOverride ?? weight);
        lastAnswered.current = current.id;
        setPending(null);
        setWeight(DEFAULT_WEIGHT);
        setAdvanced(true);
        setPromoted(under !== null);
        setLean(deckRef.current, 0);
        setPopId(current.id);
        const following = next;
        // Once per visit, for a voter who has not been to Matches yet, and only when votes remain (the
        // completion card already leads there).
        const pause =
          variant === "page" &&
          following !== null &&
          choice !== "Skip" &&
          decidedCount + 1 === MILESTONE_ANSWERS &&
          !milestoneSeen.current &&
          (voter.journey === "new" || voter.journey === "swiping");
        if (pause) {
          milestoneSeen.current = true;
          setMilestone(true);
        }
        setAnnouncement(
          `${choice === "Skip" ? "Skipped" : `Answered ${choice}`}. ${pause ? "" : following ? `Next: ${following.card.title}.` : "That was the last vote."}`,
        );
        if (variant === "hero") router.push("/swipe");
      };
      if (reduce || !card) {
        finish();
        return;
      }
      const leave = () => {
        // The next vote comes up from underneath while this one leaves (one keyframe: from wherever
        // the drag had lifted it).
        under?.animate([{ transform: "none", opacity: 1 }], {
          duration: EXIT_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        });
        const exit = card.animate(
          [
            { transform: card.style.transform || "none", opacity: 1 },
            {
              transform:
                choice === "Skip"
                  ? "translateY(40px)"
                  : `translateX(${direction * 120}%) rotate(${direction * 12}deg)`,
              opacity: 0,
            },
          ],
          { duration: EXIT_MS, easing: EASE_IN, fill: "forwards" },
        );
        exit.finished.then(finish, finish);
      };
      // The chosen oval floods with ink first, then the card leaves.
      window.setTimeout(leave, choice === "Skip" ? 0 : FILL_BEFORE_EXIT_MS);
    },
    [current, next, pending, weight, variant, router, reduce, decidedCount, voter.journey],
  );

  // While the pinned answer bar is on the page, globals.css pads scrolling so focus never lands under it.
  const answerBar = current !== null && !milestone;
  useEffect(() => {
    if (!answerBar) return;
    const root = document.documentElement;
    root.dataset.answerBar = "";
    return () => {
      delete root.dataset.answerBar;
    };
  }, [answerBar]);

  useEffect(() => {
    if (variant !== "page" || milestone) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight") commit("Yea");
      else if (event.key === "ArrowLeft") commit("Nay");
      else if (event.key === "ArrowDown") commit("Skip");
      else if (
        (event.key === "1" || event.key === "2" || event.key === "3") &&
        // Digit shortcuts work only while focus is in the deck (WCAG 2.1.4, character key shortcuts).
        deckRef.current?.contains(target)
      )
        setWeight(Number(event.key) as Weight);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, commit, milestone]);

  // The deck hydrates inside its own Suspense boundary, after the page. This marks the moment its
  // buttons and shortcuts are live (effects run in order, so the key listener above is attached);
  // the e2e tests wait for it instead of guessing.
  useEffect(() => {
    deckRef.current?.setAttribute("data-deck-ready", "");
  });

  if (cards.length === 0) {
    return (
      <p className="rounded-card border border-hairline bg-paper p-6 text-ink-2">
        No votes are published yet.
      </p>
    );
  }

  if (!current)
    return (
      <DeckComplete
        cards={cards}
        answered={answered}
        topMatch={moments && <moments.TopMatch cards={cards} />}
        arrived={advanced}
      />
    );

  const position = cards.findIndex((card) => card.id === current.id) + 1;
  const undo = () => {
    const id = lastAnswered.current ?? voter.stances.at(-1)?.keyVoteId;
    if (id) voterActions.undoStance(id);
    lastAnswered.current = null;
    // The returning card rises in; nothing was waiting underneath it.
    setPromoted(false);
    setPopId(null);
  };
  const keepGoing = () => {
    setMilestone(false);
    // The next vote was hidden behind the pause, so it rises in rather than lifting from underneath.
    setPromoted(false);
    setAnnouncement(`Next: ${current.card.title}.`);
    requestAnimationFrame(() =>
      deckRef.current?.querySelector<HTMLElement>("[data-deck-card] h2")?.focus(),
    );
  };
  const skipped = answered.size - decidedCount;

  return (
    <div ref={deckRef} className="flex w-full flex-col gap-5">
      {variant === "hero" && answered.size > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink-2 tabular-nums">
            {/* The same count as Swipe and You: a skip is an answer, but only a Yea or Nay is compared. */}
            {answered.size} of {cards.length} answered
            {skipped > 0 && ` (${skipped} skipped)`}.{" "}
            {/* Its own line on a phone, so the count and the link each read whole. */}
            <Link
              href="/swipe"
              className="text-ink underline underline-offset-4 max-sm:block max-sm:w-fit"
            >
              Go to all {cards.length} votes
            </Link>
          </p>
          <ClosestStrip cards={cards} label="Your closest match" minDecided={MILESTONE_ANSWERS} />
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {variant === "page" && (
        <div className="flex flex-col items-center gap-2">
          {answered.size === 0 && (
            // Phones explain the gesture in the answer bar instead, keeping the first vote high.
            <p className="text-center text-base text-pretty text-ink-2 max-md:hidden">
              How would you have voted? Choose Yea (yes) or Nay (no) on each one, or skip it.
            </p>
          )}
          <ProgressOvals
            ids={cards.map((card) => card.id)}
            answered={answered}
            currentId={milestone ? null : current.id}
            popId={popId}
          />
        </div>
      )}

      {milestone ? (
        moments && <moments.Milestone cards={cards} left={queue.length} onContinue={keepGoing} />
      ) : (
        <>
          <div className="relative">
            {next && variant === "page" && (
              // The next vote, whole, under this one: dragging lifts it toward its place (it tracks the
              // lean), so the card never slides off a blank sheet. Hidden from assistive tech and inert.
              <div
                key={next.id}
                ref={underRef}
                aria-hidden
                inert
                className="absolute inset-0 flex origin-top flex-col overflow-hidden rounded-card border border-hairline bg-paper p-5 [--lift:min(1,max(var(--lean-yea,0),var(--lean-nay,0))/0.95)] sm:p-6 md:rounded-b-none"
                style={{
                  transform:
                    "translateY(calc(12px * (1 - var(--lift)))) scale(calc(0.94 + 0.06 * var(--lift)))",
                  opacity: "calc(0.55 + 0.45 * var(--lift))",
                }}
              >
                <KeyVoteCard card={next} position={position + 1} total={cards.length} />
              </div>
            )}
            {variant === "hero" && (
              // The home hero reads as a small stack of ballots: two sheets fanned behind the first vote.
              <>
                <div
                  aria-hidden
                  className="absolute inset-x-3 top-2 bottom-0 origin-bottom rotate-[-2.5deg] animate-sheet-left rounded-card border border-hairline bg-paper md:inset-x-1"
                />
                <div
                  aria-hidden
                  className="absolute inset-x-3 top-2 bottom-0 origin-bottom rotate-[1.75deg] animate-sheet-right rounded-card border border-hairline bg-paper md:inset-x-1"
                />
              </>
            )}
            <DraggableCard
              key={current.id}
              cardRef={cardRef}
              deckRef={deckRef}
              card={current}
              position={position}
              total={cards.length}
              pending={pending}
              reduce={reduce}
              rise={advanced && !promoted && !reduce}
              compact={variant === "hero"}
              resuming={answered.size > 0}
              onCommit={commit}
              onAsk={
                talk
                  ? () => {
                      setTalkUsed(true);
                      setTalkOpen(true);
                    }
                  : undefined
              }
            />
          </div>
          {talkUsed && (
            <TalkSheet
              open={talkOpen}
              onOpenChange={setTalkOpen}
              card={current}
              onChoose={(choice, suggestedWeight) => {
                chosen.current = { choice, weight: suggestedWeight };
                setTalkOpen(false);
              }}
              onClosed={(event) => {
                const answer = chosen.current;
                if (!answer) return;
                chosen.current = null;
                // Focus goes to the answer just given, which stays on the page, then the answer is
                // recorded exactly as that button records it.
                event.preventDefault();
                deckRef.current
                  ?.querySelector<HTMLElement>(`[data-choice="${answer.choice}"]`)
                  ?.focus();
                commit(answer.choice, answer.weight);
              }}
            />
          )}

          <div
            ref={barRef}
            data-answer-bar
            className={cn(
              "flex flex-col gap-3",
              // On phones the answer row stays in reach, pinned just above the tab bar (home and /swipe).
              "sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-hairline bg-paper px-4 pt-3 pb-3",
              // From tablets up the answers are a tray fixed under the ballot: one object, and the ballot
              // lifts off the tray when dragged.
              "md:bottom-3 md:mx-0 md:-mt-5 md:rounded-b-card md:border md:border-t-0 md:border-hairline md:bg-canvas md:px-6 md:pt-5 md:pb-6",
              "md:data-stuck:mx-2 md:data-stuck:rounded-t-card md:data-stuck:border-t md:data-stuck:shadow-3",
              // On very short screens (a phone in landscape, or 200% zoom) a pinned bar would cover the card.
              "[@media(max-height:560px)]:static",
            )}
          >
            {answered.size === 0 ? (
              // The first vote only: how to answer, gone after the first answer.
              <p className="-mb-1 text-center text-sm text-ink-2 md:hidden">
                Swipe right for Yea, left for Nay, or tap below.
              </p>
            ) : (
              variant === "page" && (
                // Phones and tablets have no side rail: the leader so far, one tap from Matches.
                <ClosestStrip
                  cards={cards}
                  label="Closest so far"
                  minDecided={MIN_RANKED}
                  className="lg:hidden"
                />
              )
            )}
            {variant === "page" && (
              <div className="-mt-2 hidden border-b border-hairline pb-2 md:block">
                <CardReceipt card={current} />
              </div>
            )}
            <ChoiceButtons pending={pending} onChoose={commit} />
            <div className="-my-1 flex items-center justify-between gap-2">
              <CareToggle value={weight} onChange={setWeight} />
              {variant === "page" && (
                // Held (invisible) before the first answer, so the row does not shift when Undo appears.
                <button
                  type="button"
                  onClick={undo}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-sm font-semibold text-ink-2 hover:bg-accent hover:text-ink",
                    answered.size === 0 && "invisible",
                  )}
                >
                  <Undo2 className="size-4" aria-hidden />
                  <span>
                    Undo<span className="max-sm:sr-only"> last answer</span>
                  </span>
                </button>
              )}
            </div>
          </div>
          <div ref={barEndRef} aria-hidden className="-mt-5 h-px" />
          {variant === "page" && (
            <p className="hidden text-center text-sm text-ink-2 md:block">
              Use <kbd className="font-sans font-semibold text-ink">←</kbd> for Nay,{" "}
              <kbd className="font-sans font-semibold text-ink">→</kbd> for Yea, and{" "}
              <kbd className="font-sans font-semibold text-ink">↓</kbd> to skip. Press 3 if a vote
              matters a lot to you (2 is some, 1 is a little).
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface DraggableCardProps {
  cardRef: RefObject<HTMLDivElement | null>;
  deckRef: RefObject<HTMLDivElement | null>;
  card: CardView;
  position: number;
  total: number;
  pending: Choice | null;
  reduce: boolean;
  rise: boolean;
  compact: boolean;
  /** The voter has answered before; the hero's "continue" line says where they are. */
  resuming: boolean;
  onCommit: (choice: Choice) => void;
  onAsk?: () => void;
}

function DraggableCard({
  cardRef,
  deckRef,
  card,
  position,
  total,
  pending,
  reduce,
  rise,
  compact,
  resuming,
  onCommit,
  onAsk,
}: DraggableCardProps) {
  const width = useRef(360);
  const offset = useRef(0);
  const drag = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    active: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const setX = (value: number) => {
    offset.current = value;
    const rotation = clamp(
      (value / (width.current / 2)) * MAX_ROTATION,
      -MAX_ROTATION,
      MAX_ROTATION,
    );
    const element = cardRef.current;
    if (element)
      element.style.transform = value === 0 ? "" : `translateX(${value}px) rotate(${rotation}deg)`;
    setLean(deckRef.current, clamp(value / (width.current * COMMIT_SHARE), -1, 1));
  };

  const snapBack = () => {
    const element = cardRef.current;
    const from = offset.current;
    if (!element || from === 0) {
      setX(0);
      return;
    }
    const transform = element.style.transform;
    setX(0);
    element.animate([{ transform }, { transform: "none" }], {
      duration: SNAP_BACK_MS,
      easing: EASE_SNAP,
    });
    // Let the ovals drain with the card instead of jumping to empty.
    const started = performance.now();
    const drain = (now: number) => {
      const t = Math.min(1, (now - started) / SNAP_BACK_MS);
      const remaining = from * (1 - t) ** 3;
      setLean(deckRef.current, clamp(remaining / (width.current * COMMIT_SHARE), -1, 1));
      if (t < 1) requestAnimationFrame(drain);
    };
    requestAnimationFrame(drain);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || pending || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a")) return;
    width.current = event.currentTarget.offsetWidth;
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      active: false,
    };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    if (!state.active) {
      // Start dragging only on a horizontal gesture, so vertical scrolling still works.
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(event.clientY - state.startY)) return;
      state.active = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    state.velocity = (event.clientX - state.lastX) / Math.max(1, event.timeStamp - state.lastTime);
    state.lastX = event.clientX;
    state.lastTime = event.timeStamp;
    setX(dx);
  };
  const onPointerUp = () => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    if (!state?.active) return;
    const value = offset.current;
    const committed =
      Math.abs(value) > width.current * COMMIT_SHARE || Math.abs(state.velocity) > FLICK_VELOCITY;
    if (committed) onCommit(value > 0 ? "Yea" : "Nay");
    else snapBack();
  };

  return (
    <div
      ref={cardRef}
      data-deck-card
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        "relative flex touch-pan-y flex-col rounded-card border border-hairline bg-paper p-5 select-none sm:p-6 md:rounded-b-none",
        rise && "animate-card-rise",
        dragging && "shadow-4",
      )}
    >
      <DragHints />
      <KeyVoteCard
        card={card}
        position={position}
        total={total}
        compact={compact}
        showPosition={compact && !resuming}
        onAsk={onAsk}
      />
    </div>
  );
}

const HINT =
  "pointer-events-none absolute top-5 inline-flex items-center gap-1.5 rounded-control border-2 border-ink bg-paper px-2.5 py-1 text-sm font-bold text-ink";

/**
 * While dragging, the answer you are heading toward is stamped on the card's trailing edge, so it
 * stays in view as the card moves away from it.
 */
function DragHints() {
  return (
    <>
      <span
        aria-hidden
        style={{ opacity: "min(1, calc(var(--lean-yea, 0) * 2.5))" }}
        className={cn(HINT, "left-5 -rotate-6")}
      >
        <Oval size={18} filled animate={false} />
        Yea
      </span>
      <span
        aria-hidden
        style={{ opacity: "min(1, calc(var(--lean-nay, 0) * 2.5))" }}
        className={cn(HINT, "right-5 rotate-6")}
      >
        <Oval size={18} filled animate={false} />
        Nay
      </span>
    </>
  );
}

function ChoiceButtons({
  pending,
  onChoose,
}: {
  pending: Choice | null;
  onChoose: (choice: Choice) => void;
}) {
  const choice = (side: Side) => (
    <button
      type="button"
      data-choice={side}
      onClick={() => onChoose(side)}
      // aria-disabled, not disabled: disabling the focused button would drop focus to the page.
      aria-disabled={pending !== null}
      aria-keyshortcuts={side === "Yea" ? "ArrowRight" : "ArrowLeft"}
      className={cn(
        "inline-flex h-14 flex-1 items-center justify-center gap-3 rounded-control border-[1.5px] border-ink bg-paper text-base font-bold text-ink transition-colors",
        "hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        pending === side && "border-ink",
      )}
    >
      <Oval
        filled={pending === side}
        progressVar={side === "Yea" ? "--lean-yea" : "--lean-nay"}
        size={32}
        stroke={2.25}
      />
      {side}
    </button>
  );
  return (
    <div className="flex items-stretch gap-2 sm:gap-3">
      {choice("Nay")}
      <button
        type="button"
        onClick={() => onChoose("Skip")}
        aria-disabled={pending !== null}
        aria-keyshortcuts="ArrowDown"
        className="h-14 rounded-control px-4 text-base font-semibold text-ink-2 transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-5"
      >
        Skip
      </button>
      {choice("Yea")}
    </div>
  );
}

function DeckComplete({
  cards,
  answered,
  topMatch,
  arrived,
}: {
  cards: CardView[];
  answered: ReadonlyMap<string, { choice: Choice }>;
  /** The number one match (TopMatch), once its module has loaded. */
  topMatch: ReactNode;
  /** The last vote was answered on this page just now (not a return visit to a finished deck). */
  arrived: boolean;
}) {
  const decided = cards.filter((card) => {
    const stance = answered.get(card.id);
    return stance && stance.choice !== "Skip";
  }).length;
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();
  // Finishing here: the ending opens at its top (the closest match), wherever the page was scrolled,
  // and focus moves from the answer button that just went away to the heading.
  useEffect(() => {
    if (!arrived) return;
    sectionRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    headingRef.current?.focus({ preventScroll: true });
  }, [arrived, reduce]);
  return (
    <section
      ref={sectionRef}
      aria-labelledby="ballot-complete"
      className="flex flex-col gap-6 rounded-card border border-hairline bg-paper p-5 sm:p-8"
    >
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink-2">Your ballot is complete</p>
        <h2
          id="ballot-complete"
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-extrabold tracking-tight text-ink outline-none"
        >
          You took a side on {decided} of {cards.length} votes
        </h2>
        <p className="text-base text-ink-2">
          Here is how you marked them. See which members of Congress voted the way you would have.
        </p>
      </header>
      {topMatch}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link href="/matches" onClick={() => voterActions.markMatched()}>
            See your matches
          </Link>
        </Button>
        <Button asChild variant="link" size="lg">
          <Link href="/you">Change an answer</Link>
        </Button>
      </div>
      {/* A filled-in paper ballot: each vote with your mark, inked in one after another, 30 ms apart.
          Only the first rows (the ones a phone shows) play; the rest are simply filled. */}
      <ol className="flex flex-col divide-y divide-hairline border-y border-hairline">
        {cards.map((card, index) => {
          const choice = answered.get(card.id)?.choice ?? "Skip";
          return (
            <li key={card.id} className="flex items-center justify-between gap-4 py-2.5">
              <span className="min-w-0 text-sm font-semibold text-ink">{card.card.title}</span>
              <span
                className="flex shrink-0 items-center gap-3 text-xs font-semibold text-ink-2"
                aria-label={choice === "Skip" ? "Skipped" : `You marked ${choice}`}
              >
                {(["Yea", "Nay"] as const).map((side) => (
                  <span key={side} className="inline-flex items-center gap-1" aria-hidden>
                    <Oval
                      filled={choice === side}
                      size={22}
                      stroke={2}
                      inkDelayMs={index < INKED_ROWS ? 120 + index * 30 : undefined}
                    />
                    {side}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Completion rows whose ovals ink in one by one; about what a phone shows under the header. */
const INKED_ROWS = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
