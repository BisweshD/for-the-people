"use client";

import {
  parseDistrictId,
  WEIGHT_LABELS,
  type Choice,
  type DistrictId,
  type Stance,
  type Weight,
} from "@for-the-people/core/client";
import { Laptop, Moon, Smartphone, Sun } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { useFlip } from "@/hooks/use-flip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { toast } from "@/lib/toast";
import { IssueIcon } from "@/components/issue-icon";
import { Oval } from "@/components/oval";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { districtLabel, STATE_NAMES } from "@/lib/format";
import { formatEasternDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useVoter, voterActions } from "@/lib/voter-store";

/** A card as this page needs it: enough to name the stance. */
export interface StanceCard {
  id: string;
  title: string;
  issueLabel: string;
  issueIcon: string;
}

const CHOICES: Choice[] = ["Yea", "Nay", "Skip"];
const WEIGHTS: Weight[] = [1, 2, 3];
const THEMES = [
  { value: "system", label: "Match my device", icon: Laptop },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

const noop = () => () => {};
/** True only after hydration, so device data never renders into server HTML. */
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

/** A cleared row folds away this long before the list closes the gap. */
const REMOVE_MS = 200;
const CLOSE_GAP = { duration: REMOVE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

const ClearDataDialog = dynamic(
  () => import("@/components/you/clear-data-dialog").then((module) => module.ClearDataDialog),
  { ssr: false },
);

export function YouView({ cards }: { cards: StanceCard[] }) {
  const voter = useVoter();
  const hydrated = useHydrated();
  const byId = new Map(cards.map((card) => [card.id, card]));
  const stances = [...voter.stances].sort(
    (a, b) =>
      (cards.findIndex((card) => card.id === a.keyVoteId) + 1 || Infinity) -
      (cards.findIndex((card) => card.id === b.keyVoteId) + 1 || Infinity),
  );
  const skipped = stances.filter((stance) => stance.choice === "Skip").length;
  const answeredIds = new Set(stances.map((stance) => stance.keyVoteId));
  const decidedIds = new Set(
    stances.filter((stance) => stance.choice !== "Skip").map((stance) => stance.keyVoteId),
  );
  const remaining = cards.filter((card) => !answeredIds.has(card.id)).length;
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  useFlip(listRef, !reduceMotion, CLOSE_GAP);

  /**
   * Clears one answer: the row folds away, the rows below close the gap, and a toast offers Undo,
   * which puts the answer back exactly as it was. Focus moves to the next row's Edit button (or the
   * heading when none is left), so keyboard users keep their place.
   */
  const clear = (stance: Stance, title: string) => {
    if (leaving) return;
    const index = stances.findIndex((entry) => entry.keyVoteId === stance.keyVoteId);
    const commit = () => {
      setLeaving(null);
      voterActions.undoStance(stance.keyVoteId);
      toast("Answer cleared", {
        description: title,
        action: { label: "Undo", onClick: () => voterActions.restoreStance(stance) },
      });
      requestAnimationFrame(() => {
        const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-edit]");
        const next = buttons?.[Math.min(index, buttons.length - 1)];
        (next ?? document.getElementById("answers"))?.focus();
      });
    };
    if (reduceMotion) commit();
    else {
      setLeaving(stance.keyVoteId);
      window.setTimeout(commit, REMOVE_MS);
    }
  };

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="answers" className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <h2 id="answers" tabIndex={-1} className="text-2xl font-bold text-ink outline-none">
            Your answers
          </h2>
          {hydrated && cards.length > 0 && (
            // Two even rows of ten on a phone; one row from tablets up.
            <ol className="grid w-fit grid-cols-10 gap-x-1.5 gap-y-2 sm:flex" aria-hidden>
              {/* In the list's order, then the rest: filled for a Yea or Nay, dashed for a skip,
                  hollow grey for not answered yet. */}
              {[
                ...stances.flatMap((stance) => byId.get(stance.keyVoteId) ?? []),
                ...cards.filter((card) => !answeredIds.has(card.id)),
              ].map((card) => (
                <li key={card.id}>
                  <Oval
                    size={18}
                    filled={decidedIds.has(card.id)}
                    dashed={answeredIds.has(card.id) && !decidedIds.has(card.id)}
                    animate={false}
                    stroke={answeredIds.has(card.id) ? 1.75 : 1.5}
                    className={answeredIds.has(card.id) ? "" : "[&_ellipse]:stroke-ink-3-graphic"}
                  />
                </li>
              ))}
            </ol>
          )}
          <p className="text-base text-ink-2 tabular-nums">
            {!hydrated
              ? "Loading what is saved on this device."
              : stances.length === 0
                ? "You have not answered any key votes yet."
                : `${stances.length} of ${cards.length} key votes answered${skipped > 0 ? ` (${skipped} skipped)` : ""}.`}
          </p>
          {hydrated && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {remaining > 0 && (
                <Button asChild size="lg">
                  <Link href="/swipe">
                    {stances.length === 0 ? "Answer key votes" : `Answer the other ${remaining}`}
                  </Link>
                </Button>
              )}
              {stances.length > 0 && (
                <Button asChild variant="link">
                  <Link href="/matches">See your matches</Link>
                </Button>
              )}
            </div>
          )}
        </div>
        {stances.length > 0 && (
          <ul ref={listRef} className="flex flex-col border-t border-ink">
            {stances.map((stance) => (
              <StanceRow
                key={stance.keyVoteId}
                stance={stance}
                card={byId.get(stance.keyVoteId)}
                leaving={leaving === stance.keyVoteId}
                onClear={clear}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="location" className="flex flex-col gap-4">
        <h2 id="location" className="text-2xl font-bold text-ink">
          Your location
        </h2>
        {hydrated && voter.location ? (
          <div className="flex flex-col gap-4 rounded-card border border-hairline bg-paper p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-lg font-bold text-ink">{STATE_NAMES[voter.location.state]}</p>
              <p className="text-base text-ink-2">
                {voter.location.districts.length > 0
                  ? voter.location.districts.map(describeDistrict).join(", ")
                  : "No district saved"}
              </p>
              <p className="text-sm text-ink-2">
                Saved {formatEasternDate(voter.location.setAt)}. We keep district ids only, never
                your address.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                voterActions.setLocation(null);
                toast.success("Location cleared");
              }}
            >
              Clear location
            </Button>
          </div>
        ) : hydrated ? (
          <div className="flex flex-col items-start gap-3 rounded-card border border-hairline bg-paper p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base text-ink-2">
              No location saved. Your districts are kept here once you find your ballot.
            </p>
            {/* Secondary: answering the votes is this page's one main action. */}
            <Button asChild variant="outline">
              <Link href="/ballot">Find my ballot</Link>
            </Button>
          </div>
        ) : (
          <p className="text-base text-ink-2">Loading what is saved on this device.</p>
        )}
      </section>

      <ThemePicker hydrated={hydrated} />

      <section
        aria-labelledby="device"
        className="flex flex-col gap-5 border-t border-hairline pt-8"
      >
        <div className="flex flex-col gap-2">
          <h2 id="device" className="flex items-center gap-2.5 text-2xl font-bold text-ink">
            <Smartphone className="size-5 shrink-0 text-ink-3-graphic" aria-hidden />
            Everything here stays on this device
          </h2>
          <p className="max-w-2xl text-base text-ink-2">
            Your answers, location, ballot plan, and theme are saved in this browser only. There is
            no account, and we never receive them, except the answers you choose to share for one
            Ask question with “Use my answers.” Clearing your browser data or the link below removes
            them for good.
          </p>
        </div>
        <ClearAllData answers={hydrated ? stances.length : 0} />
      </section>
    </div>
  );
}

function describeDistrict(id: DistrictId): string {
  const { state, number, mapVersion } = parseDistrictId(id);
  const label = districtLabel(state, number);
  return mapVersion === "cd120" ? `${label} (2026 map)` : `${label} (current map)`;
}

/** The voter's mark at rest: a filled oval and the word, or a dashed oval for a skip. */
function AnswerMark({ choice }: { choice: Choice }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
      <Oval size={18} filled={choice !== "Skip"} dashed={choice === "Skip"} animate={false} />
      {choice === "Skip" ? "Skipped" : choice}
    </span>
  );
}

/**
 * One answer: its title and a one-line summary ("Nay | Matters: Some"). Edit opens the controls in
 * place (the height grows over 200 ms), so the list stays short and scannable until a change is wanted.
 */
function StanceRow({
  stance,
  card,
  leaving,
  onClear,
}: {
  stance: Stance;
  card: StanceCard | undefined;
  leaving: boolean;
  onClear: (stance: Stance, title: string) => void;
}) {
  const title = card?.title ?? "A key vote that is no longer published";
  const name = `answer-${stance.keyVoteId}`;
  const ids = useId();
  const [open, setOpen] = useState(false);
  return (
    <li
      data-flip={stance.keyVoteId}
      className={cn(
        "flex origin-top flex-col border-b border-hairline py-3",
        leaving && "pointer-events-none animate-row-out",
      )}
    >
      <div className="flex items-start gap-3">
        {card && (
          <IssueIcon name={card.issueIcon} className="mt-0.5 size-5 shrink-0 text-ink-3-graphic" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* The answer date is part of the row's name for screen readers and its tooltip; it is
              the same on most rows, so it is not repeated on screen. */}
          <p
            id={`${ids}-title`}
            title={`Answered ${formatEasternDate(stance.answeredAt)}`}
            className="text-base leading-snug font-semibold text-ink"
          >
            {title}
            <span className="sr-only">, answered {formatEasternDate(stance.answeredAt)}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-2">
            <AnswerMark choice={stance.choice} />
            {stance.choice !== "Skip" && (
              <>
                <span aria-hidden className="h-4 w-px bg-hairline" />
                <span>
                  Matters:{" "}
                  <span className="font-semibold text-ink">{WEIGHT_LABELS[stance.weight]}</span>
                </span>
              </>
            )}
            {stance.choice === "Skip" && <span>Not counted in your matches</span>}
          </p>
        </div>
        {/* A fixed width, so the title does not rewrap when the label turns to Done. */}
        <Button
          type="button"
          variant="link"
          data-edit
          aria-expanded={open}
          aria-controls={`${ids}-editor`}
          onClick={() => setOpen((value) => !value)}
          className="-mt-2 min-w-16"
        >
          {open ? "Done" : "Edit"}
          <span className="sr-only">
            {open ? " editing your answer on " : " your answer on "}
            {title}
          </span>
        </Button>
      </div>
      <div id={`${ids}-editor`} className="journey-disclose" data-open={open || undefined}>
        {/* Padding inside the clipped box keeps focus rings whole while it opens. */}
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-1 pt-3 pl-8">
            <div
              role="radiogroup"
              aria-labelledby={`${ids}-title`}
              aria-describedby={`${ids}-answer`}
              className="flex items-center gap-0.5"
            >
              <span id={`${ids}-answer`} className="sr-only">
                Your answer
              </span>
              {CHOICES.map((choice) => (
                <label
                  key={choice}
                  className={cn(
                    "relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-transparent px-2.5 text-sm font-semibold text-ink-2 hover:bg-accent has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    choice === "Skip" && "has-[:checked]:border-hairline has-[:checked]:bg-canvas",
                  )}
                >
                  <input
                    type="radio"
                    name={name}
                    value={choice}
                    checked={stance.choice === choice}
                    onChange={() =>
                      voterActions.recordStance(stance.keyVoteId, choice, stance.weight)
                    }
                    className="sr-only"
                  />
                  {choice !== "Skip" && (
                    <Oval size={20} filled={stance.choice === choice} animate={false} />
                  )}
                  {choice}
                </label>
              ))}
            </div>
            {stance.choice !== "Skip" && (
              <div className="min-w-[12rem] flex-1 sm:max-w-[15rem]">
                <span id={`${ids}-care`} className="sr-only">
                  How much {title} matters to you
                </span>
                <Segmented<`${Weight}`>
                  value={`${stance.weight}` as `${Weight}`}
                  onChange={(value) =>
                    voterActions.setWeight(stance.keyVoteId, Number(value) as Weight)
                  }
                  labelledBy={`${ids}-care`}
                  options={WEIGHTS.map((weight) => ({
                    value: `${weight}` as `${Weight}`,
                    label: WEIGHT_LABELS[weight],
                  }))}
                  className="grid grid-cols-3 gap-0 rounded-control border border-hairline bg-paper p-0.5"
                  itemClassName="min-h-11 rounded-[10px] px-2 text-sm font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-canvas hover:text-ink data-[state=on]:font-bold data-[state=on]:text-ink data-[state=on]:underline data-[state=on]:decoration-2 data-[state=on]:underline-offset-[5px]"
                />
              </div>
            )}
            <Button type="button" variant="link" onClick={() => onClear(stance, title)}>
              Clear answer<span className="sr-only"> on {title}</span>
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

function ThemePicker({ hydrated }: { hydrated: boolean }) {
  const { theme, setTheme } = useTheme();
  const current = hydrated ? (theme ?? "system") : null;
  return (
    <section aria-labelledby="theme" className="flex flex-col gap-4">
      <h2 id="theme" className="text-2xl font-bold text-ink">
        Appearance
      </h2>
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">Theme</legend>
        {THEMES.map((option) => {
          const Icon = option.icon;
          return (
            <label
              key={option.value}
              className="flex min-h-14 cursor-pointer items-center gap-3 rounded-control border border-hairline bg-paper px-4 text-base font-semibold text-ink hover:bg-accent has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={current === option.value}
                onChange={() => {
                  setTheme(option.value);
                  voterActions.setTheme(option.value);
                }}
                className="sr-only"
              />
              <Icon className="size-5 text-ink-2" aria-hidden />
              {option.label}
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}

/** Quiet at rest (an underlined link in the text color); the dialog spells out what goes. */
function ClearAllData({ answers }: { answers: number }) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="link"
        aria-haspopup="dialog"
        onClick={() => {
          setUsed(true);
          setOpen(true);
        }}
        className="w-fit"
      >
        Clear all my data
      </Button>
      {used && <ClearDataDialog open={open} onOpenChange={setOpen} answers={answers} />}
    </>
  );
}
