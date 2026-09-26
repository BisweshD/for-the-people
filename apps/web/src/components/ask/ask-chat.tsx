"use client";

import { useChat } from "@ai-sdk/react";
import { fitHistory } from "@for-the-people/core/client";
import { DefaultChatTransport, isToolUIPart, type ToolUIPart } from "ai";
import { ArrowUp, FileText, RotateCcw, Scale } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Tooltip } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CompareStrip,
  DemoNote,
  KeyVoteList,
  MeasureList,
  MemberRecord,
  MethodNote,
  MoneyMini,
  PeopleList,
  ResultSection,
  RollCallCard,
  VoteList,
} from "@/components/ask/ask-cards";
import { OvalLoader } from "@/components/ask/oval-loader";
import { AskReceipts } from "@/components/ask/receipts";
import { OvalLoader as InlineOvalLoader } from "@/components/oval-loader";
import { Portrait } from "@/components/portrait";
import { SwitchTrack } from "@/components/switch-track";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  personalSuggestion,
  suggestionsFor,
  type AskSenator,
  type Suggestion,
  type SuggestionLead,
} from "@/lib/ask-suggestions";
import { chamberName, formatDate } from "@/lib/format";
import type { CardView, RollCallView } from "@/lib/views";
import { useVoter } from "@/lib/voter-store";
import { cn } from "@/lib/utils";
import type { AskUIMessage, AskUITools } from "@/server/ask/tools";

const MAX_QUESTION = 500;
/** Each result in an answer arrives this long after the one before it. */
const STAGGER_MS = 40;

function errorText(error: Error | undefined): string {
  if (!error) return "";
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON: a network failure.
  }
  return "The question could not be sent. Check your connection and try again.";
}

type AskToolPart = ToolUIPart<AskUITools>;

function ToolResult({ part }: { part: AskToolPart }) {
  if (part.state === "output-error")
    return (
      <ResultSection title="Lookup">
        <p className="text-base text-ink-2">That lookup did not work. Try asking another way.</p>
      </ResultSection>
    );
  if (part.state !== "output-available")
    return <div className="h-24 border-t border-hairline" aria-hidden />;
  switch (part.type) {
    case "tool-findPeople":
      return (
        <PeopleList
          people={part.output.people}
          title={part.output.people.length === 1 ? "Member" : "Members of Congress"}
          empty="No record yet of a member by that name."
        />
      );
    case "tool-getPerson":
      return <MemberRecord output={part.output} />;
    case "tool-getVotes":
      return (
        <VoteList
          person={part.output.person}
          votes={part.output.votes}
          counted={part.output.tally.keyVotes}
          issueLabel={part.output.issue?.label ?? null}
        />
      );
    case "tool-getKeyVotes":
      return (
        <KeyVoteList
          keyVotes={part.output.keyVotes}
          issueLabel={part.output.issue?.label ?? null}
        />
      );
    case "tool-getRollCall":
      return <RollCallCard output={part.output} />;
    case "tool-getMeasure":
      return <MeasureList output={part.output} />;
    case "tool-compare":
      return <CompareStrip output={part.output} />;
    case "tool-getMoney":
      return <MoneyMini output={part.output} />;
    case "tool-myRepresentatives":
      return (
        <PeopleList
          people={part.output.people}
          title="Your members of Congress"
          empty={
            part.output.status === "no-location"
              ? "Add your address on the Ballot page to see your members."
              : "No record yet of members for your district."
          }
        />
      );
    case "tool-explainMethod":
      return <MethodNote output={part.output} />;
  }
}

/** A name lookup is not shown again when a later result (the member's record, or a comparison) shows the people. */
function visibleToolParts(message: AskUIMessage): AskToolPart[] {
  const parts = message.parts.filter(isToolUIPart) as AskToolPart[];
  const types = new Set(parts.map((part) => part.type));
  const peopleShown = types.has("tool-getPerson") || types.has("tool-compare");
  return parts.filter((part) => !(part.type === "tool-findPeople" && peopleShown));
}

/** Every roll call an answer's results rest on, once each. */
function answerRollCalls(parts: readonly AskToolPart[]): RollCallView[] {
  const found = new Map<string, RollCallView>();
  const add = (rollCall: RollCallView | null | undefined) => {
    if (rollCall) found.set(rollCall.id, rollCall);
  };
  for (const part of parts) {
    if (part.state !== "output-available") continue;
    switch (part.type) {
      case "tool-getVotes":
        for (const vote of part.output.votes) add(vote.side?.rollCall);
        break;
      case "tool-getKeyVotes":
        for (const keyVote of part.output.keyVotes) keyVote.rollCalls.forEach(add);
        break;
      case "tool-getRollCall":
        add(part.output.rollCall);
        break;
      case "tool-getMeasure":
        for (const measure of part.output.measures) measure.rollCalls.forEach(add);
        break;
      case "tool-compare":
        for (const row of part.output.rows) {
          add(row.a?.rollCall);
          add(row.b?.rollCall);
        }
        break;
    }
  }
  return [...found.values()];
}

/** "From Senate roll call 7, Jan 20, 2025", or "From 11 official roll calls, Jan 2025 to Jul 2025". */
function recordLine(rollCalls: readonly RollCallView[]): string | null {
  const [first] = rollCalls;
  if (!first) return null;
  if (rollCalls.length === 1)
    return `From ${chamberName(first.chamber)} roll call ${first.number}, ${formatDate(first.date)}`;
  const dates = rollCalls.map((rollCall) => rollCall.date).sort();
  return `From ${rollCalls.length} official roll calls, ${formatDate(dates[0]!)} to ${formatDate(dates.at(-1)!)}`;
}

const answerText = (message: AskUIMessage): string =>
  message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .trim();

/**
 * One answer. While it is being written the oval loader holds its place; once it is complete it
 * arrives as one sequence: the sentence, then each result
 * 40 ms after the one before, so text and results never enter out of order.
 */
function AssistantMessage({ message, pending }: { message: AskUIMessage; pending: boolean }) {
  if (pending)
    return (
      <article
        className="flex flex-col gap-4 border-t-2 border-ink pt-4"
        aria-label="For The People"
      >
        <OvalLoader label="Checking the record" />
      </article>
    );
  const text = answerText(message);
  const tools = visibleToolParts(message);
  const line = recordLine(answerRollCalls(tools));
  const offset = text ? 1 : 0;
  return (
    <article className="flex flex-col gap-4 border-t-2 border-ink pt-4" aria-label="For The People">
      {text && (
        <div className="flex animate-answer-in flex-col gap-1.5 motion-reduce:animate-none">
          <p className="max-w-[68ch] text-base leading-relaxed text-ink md:text-lg">{text}</p>
          {line && <p className="text-sm text-ink-2 tabular-nums">{line}</p>}
        </div>
      )}
      {tools.map((part, index) => (
        <div
          key={part.toolCallId}
          className="animate-answer-in motion-reduce:animate-none"
          style={{ animationDelay: `${(index + offset) * STAGGER_MS}ms` }}
        >
          <ToolResult part={part} />
        </div>
      ))}
    </article>
  );
}

/** The question as the heading of its answer, set left like the record under it. */
function UserMessage({ message }: { message: AskUIMessage }) {
  const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ");
  return (
    <h2 className="max-w-[60ch] text-2xl leading-tight font-extrabold tracking-tight text-pretty text-ink md:text-[30px]">
      <span className="sr-only">You asked: </span>
      {text}
    </h2>
  );
}

/**
 * A suggestion's lead: a 32 px portrait (two, overlapped, for a comparison), a page mark for a bill (its
 * number sits under the question), or a scale for how the match is weighed.
 */
function Lead({ lead }: { lead: SuggestionLead }) {
  if (lead.kind !== "people") {
    const Icon = lead.kind === "bill" ? FileText : Scale;
    return (
      <span className="grid h-10 w-8 place-items-center">
        <Icon className="size-6 text-ink-2" strokeWidth={1.75} aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex h-10">
      {lead.people.map((person, index) => (
        <Portrait
          key={person.name}
          portrait={person.portrait}
          name={person.name}
          sizes="32px"
          decorative
          className={cn("w-8 shrink-0 rounded-control", index > 0 && "-ml-3 ring-2 ring-canvas")}
        />
      ))}
    </span>
  );
}

/**
 * The line under a suggestion: the bill's number when the question names it by its title, and why a
 * personal row is first ("You answered Yea"). A question that already names the number does not repeat it.
 */
function SuggestionDetail({ suggestion }: { suggestion: Suggestion }) {
  const { lead, note, question } = suggestion;
  const label = lead.kind === "bill" && !question.includes(lead.label) ? lead.label : null;
  if (!label && !note) return null;
  return (
    <span className="flex flex-wrap gap-x-3 text-sm text-ink-2 tabular-nums">
      {label && <span>{label}</span>}
      {note && <span>{note}</span>}
    </span>
  );
}

/** The empty state's suggestions, as record rows in one column (not chips). */
function SuggestionRows({
  suggestions,
  onAsk,
}: {
  suggestions: readonly Suggestion[];
  onAsk: (question: string, event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <section aria-labelledby="suggested" className="mt-10 flex flex-col gap-2">
      <h2 id="suggested" className="text-sm font-semibold text-ink-2">
        Try a question
      </h2>
      <ul className="flex flex-col border-t border-hairline">
        {suggestions.map((suggestion) => (
          <li key={suggestion.question} className="border-b border-hairline">
            <button
              type="button"
              onClick={(event) => onAsk(suggestion.question, event)}
              className="-mx-2 grid min-h-16 w-[calc(100%+1rem)] grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-3 rounded-control px-2 py-3 text-left transition-transform duration-150 hover:bg-accent active:scale-[0.99] motion-reduce:transition-none"
            >
              <Lead lead={suggestion.lead} />
              <span className="flex min-w-0 flex-col">
                <span data-question className="text-base font-medium text-ink">
                  {suggestion.question}
                </span>
                <SuggestionDetail suggestion={suggestion} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AskChat({
  demo,
  cards,
  starters,
  senators,
}: {
  demo: boolean;
  cards: CardView[];
  starters: Suggestion[];
  senators: AskSenator[];
}) {
  const searchParams = useSearchParams();
  const [input, setInput] = useState(() => (searchParams.get("q") ?? "").slice(0, MAX_QUESTION));
  const [useAnswers, setUseAnswers] = useState(false);
  const voter = useVoter();
  const reduceMotion = useReducedMotion();
  const answered = voter.stances.filter((stance) => stance.choice !== "Skip");
  // Worked out here from what the device holds; nothing about the voter is sent to build it.
  const suggestions = useMemo(
    () =>
      suggestionsFor(
        personalSuggestion({ stances: voter.stances, location: voter.location }, senators, cards),
        starters,
      ),
    [voter.stances, voter.location, senators, cards, starters],
  );
  // Sends only the newest text that fits the server's history cap; tool results never leave the page.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<AskUIMessage>({
        api: "/api/ask",
        prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
          body: { ...body, id, messages: fitHistory(messages), trigger, messageId },
        }),
      }),
    [],
  );
  // The question most recently sent, so a failed send can hand it back instead of losing it.
  const lastAsked = useRef("");
  const { messages, sendMessage, status, error, regenerate, clearError, setMessages } =
    useChat<AskUIMessage>({
      transport,
      // When a question fails before any answer arrives, it goes back into the field, ready to send
      // again or edit, and leaves the conversation, so a second try never shows it twice.
      onError: () => {
        setMessages((current) =>
          current.at(-1)?.role === "user" ? current.slice(0, -1) : current,
        );
        setInput((current) => (current.trim() ? current : lastAsked.current));
      },
    });
  const busy = status === "submitted" || status === "streaming";
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A new question scrolls to the top of the view, so its answer arrives below it, clear of the composer.
  const lastMessage = messages.at(-1);
  const lastQuestionId = lastMessage?.role === "user" ? lastMessage.id : null;
  // The first question goes to the top of the page instead, under the page title (the intro folds
  // away once a question is asked), so nothing sits half-hidden under the site header.
  const firstQuestion = messages[0]?.id === lastQuestionId;
  useEffect(() => {
    if (!lastQuestionId) return;
    const behavior = reduceMotion ? "auto" : "smooth";
    if (firstQuestion) window.scrollTo({ top: 0, behavior });
    else
      document
        .getElementById(`ask-${lastQuestionId}`)
        ?.scrollIntoView({ block: "start", behavior });
  }, [lastQuestionId, firstQuestion, reduceMotion]);

  useEffect(() => {
    if (searchParams.get("q")) inputRef.current?.focus();
  }, [searchParams]);

  const ask = (question: string) => {
    const text = question.trim().slice(0, MAX_QUESTION);
    if (busy) return;
    // An empty ask stays put and puts the cursor in the box, where the question goes.
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    clearError();
    lastAsked.current = text;
    const districtIds = voter.location?.districts;
    void sendMessage(
      { text },
      {
        body: {
          ...(useAnswers && answered.length > 0 ? { stances: voter.stances } : {}),
          ...(districtIds && districtIds.length > 0 ? { districtIds } : {}),
        },
      },
    );
    setInput("");
    setUseAnswers(false);
  };

  const waitingForFirstPart = busy && lastMessage?.role === "user";
  const demoAnswer = demo || messages.some((message) => message.metadata?.demo);
  const started = messages.length > 0;
  const lastAnswer = messages.findLast((message) => message.role === "assistant");
  const canUseAnswers = answered.length > 0;
  const answerWord = answered.length === 1 ? "answer" : "answers";
  const empty = input.trim().length === 0;
  // Once the conversation starts, the switch sits beside the field from 768px with its line under both;
  // on a phone the line shows only while the switch is on, so less of the answer is covered.
  const compactHelper = started && !useAnswers;
  const announcement = busy
    ? "Checking the record."
    : lastAnswer
      ? `For The People answered. ${answerText(lastAnswer)}`
      : "";

  return (
    <AskReceipts>
      <div className="flex flex-col">
        <form
          data-ask-composer={started ? "sticky" : "inline"}
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
          className={cn(
            "z-20 flex flex-col gap-1.5",
            // Once stuck, the composer sits on a flat band of canvas (gradients are banned, 8.7) with a
            // hairline top edge and 16 px above the field, so answers slide under a line instead of being
            // cut through their glyphs, and never show through.
            started &&
              "sticky bottom-[calc(57px+env(safe-area-inset-bottom))] order-last -mx-4 mt-4 border-t border-hairline bg-canvas px-4 pt-4 pb-2 md:bottom-0 md:mx-0 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-3 md:gap-y-1.5 md:px-0 md:pb-6",
          )}
        >
          {/*
           * One field: the question and the Ask button on one line. Focus shows as one ink ring on the
           * field's own edge, never a second outline around it. The "Use my answers" switch sits under
           * the field, beside the line that says what it sends, so the choice and its meaning read together
           * (once the composer is docked, it sits beside the field from 768px).
           */}
          <div
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-1 rounded-control border border-ink bg-paper p-1.5 pl-2",
              "has-[textarea:focus-visible]:border-ink has-[textarea:focus-visible]:ring-1 has-[textarea:focus-visible]:ring-ink",
              started && "shadow-3",
            )}
          >
            <label htmlFor="ask-input" className="sr-only">
              Your question
            </label>
            <textarea
              id="ask-input"
              ref={inputRef}
              value={input}
              maxLength={MAX_QUESTION}
              rows={1}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  ask(input);
                }
              }}
              placeholder="Ask about a member or a bill"
              className="field-sizing-content max-h-40 min-h-11 resize-none bg-transparent px-1 py-2.5 text-base text-ink placeholder:text-ink-3 focus-visible:outline-none md:text-lg"
            />
            {/*
             * The Ask button: 44 px, solid ink once there is a question to send, and at rest a paper
             * button with a 3:1 edge, so it never reads as missing or switched off. It stays a real,
             * focusable button either way and says why nothing was sent.
             */}
            <Tooltip.Provider delayDuration={400}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <Button
                    type="submit"
                    size="icon"
                    variant={empty && !busy ? "outline" : "default"}
                    aria-disabled={busy || undefined}
                    aria-describedby={busy || empty ? "ask-send-why" : undefined}
                    className={cn(busy && "cursor-progress")}
                  >
                    {busy ? (
                      <InlineOvalLoader size={20} />
                    ) : (
                      <ArrowUp strokeWidth={2.25} aria-hidden />
                    )}
                    <span className="sr-only">Ask</span>
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="top"
                    sideOffset={8}
                    className="z-50 rounded-control bg-ink px-2.5 py-1 text-sm font-semibold text-paper shadow-2"
                  >
                    Ask
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
            <span id="ask-send-why" className="sr-only">
              {busy ? "Wait for this answer to finish." : "Type a question first."}
            </span>
          </div>
          {canUseAnswers && (
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1",
                started && "md:contents",
              )}
            >
              <button
                type="button"
                role="switch"
                aria-checked={useAnswers}
                aria-describedby="use-answers-help"
                onClick={() => setUseAnswers((value) => !value)}
                className="-ml-1.5 inline-flex min-h-11 items-center gap-2 rounded-control pr-2.5 pl-1.5 text-sm font-semibold whitespace-nowrap text-ink tabular-nums hover:bg-accent"
              >
                <SwitchTrack on={useAnswers} />
                Use my {answered.length} {answerWord}
              </button>
              <p
                id="use-answers-help"
                className={cn(
                  "text-sm text-ink-2 tabular-nums",
                  started && "md:col-span-2",
                  compactHelper && "max-md:sr-only",
                )}
              >
                {useAnswers
                  ? `Sends your ${answered.length} ${answerWord} with this question only.`
                  : `Your ${answerWord} stay on this device unless you switch this on.`}
              </p>
            </div>
          )}
        </form>

        {/*
         * The conversation is a log for reading back; it does not announce itself, because an answer's
         * tables would be read out whole. The status line below is the one live region, mounted with
         * the page and never removed: "Checking the record", then the answer's sentence.
         */}
        <div role="log" aria-live="off" aria-busy={busy} aria-label="Conversation">
          {started && (
            <ol className="flex flex-col">
              {messages.map((message, index) => (
                <li
                  key={message.id}
                  id={`ask-${message.id}`}
                  className={cn(
                    "scroll-mt-[4.5rem] md:scroll-mt-24",
                    // A question sits just above its answer; a new question starts well clear of the last.
                    message.role === "user" ? "mt-12 first:mt-0" : "mt-3",
                    // The newest answer gets room, so its question can sit at the top of the view.
                    index === messages.length - 1 &&
                      message.role === "assistant" &&
                      "min-h-[45dvh]",
                  )}
                >
                  {message.role === "user" ? (
                    <UserMessage message={message} />
                  ) : (
                    <AssistantMessage
                      message={message}
                      pending={busy && index === messages.length - 1}
                    />
                  )}
                </li>
              ))}
              {waitingForFirstPart && (
                <li className="mt-3 min-h-[45dvh]">
                  <div className="flex flex-col gap-4 border-t-2 border-ink pt-4">
                    <OvalLoader label="Checking the record" />
                  </div>
                </li>
              )}
            </ol>
          )}
        </div>
        <p role="status" aria-live="polite" className="sr-only" data-ask-status>
          {announcement}
        </p>

        {error && (
          <div role="alert" className="mt-6 flex flex-col gap-3 border-t-2 border-ink pt-4">
            <p className="text-base text-ink">{errorText(error)}</p>
            {lastMessage?.role !== "assistant" && input.trim() && (
              <p className="text-sm text-ink-2">
                Your question is still in the box, ready to send.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => {
                // A half-written answer is written again; a question that got no answer is sent again.
                if (lastMessage?.role === "assistant") {
                  clearError();
                  void regenerate();
                } else ask(input);
              }}
            >
              <RotateCcw aria-hidden />
              Try again
            </Button>
          </div>
        )}

        {!started && (
          <SuggestionRows
            suggestions={suggestions}
            onAsk={(question, event) => {
              ask(question);
              // The list goes away, so focus moves to the composer, except on touch, where
              // focusing it would cover the answer with the keyboard.
              if ((event.nativeEvent as PointerEvent).pointerType !== "touch")
                inputRef.current?.focus({ preventScroll: true });
            }}
          />
        )}

        {demoAnswer && <DemoNote className={started ? "mt-6" : "mt-8"} />}
      </div>
    </AskReceipts>
  );
}
