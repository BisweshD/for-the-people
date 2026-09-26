"use client";

import { useChat } from "@ai-sdk/react";
import { fitHistory, type Weight } from "@for-the-people/core/client";
import { DefaultChatTransport, isToolUIPart } from "ai";
import { ArrowUp, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { OvalLoader } from "@/components/ask/oval-loader";
import { Oval } from "@/components/oval";
import { OvalLoader as InlineOvalLoader } from "@/components/oval-loader";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { CardView } from "@/lib/views";
import type { DecideSuggestion, DecideUIMessage } from "@/server/decide/engine";

/**
 * "Ask about this bill": a short conversation about the vote in front of the voter, in the Receipt's
 * sheet (a bottom sheet under 768 px, a side panel above). Only this vote's id and the conversation are
 * sent. The model can suggest an answer; choosing it records the answer exactly as the Yea and Nay
 * buttons do, through `onChoose`, and closes the sheet. Loaded the first time someone opens it.
 */

const MAX_MESSAGE = 500;

const STARTERS = [
  "What does this bill do, in plain words?",
  "What do supporters and opponents say?",
  "Help me decide which answer fits me",
];

function errorText(error: Error | undefined): string {
  if (!error) return "";
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON: a network failure.
  }
  return "Your message could not be sent. Check your connection and try again.";
}

const textOf = (message: DecideUIMessage): string =>
  message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .trim();

export function TalkSheet({
  open,
  onOpenChange,
  card,
  onChoose,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: CardView;
  onChoose: (choice: "Yea" | "Nay", weight: Weight | null) => void;
  /** After the sheet has closed: the deck records a chosen answer then, where the voter can see it. */
  onClosed: (event: Event) => void;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className="gap-0 overflow-hidden"
        onCloseAutoFocus={onClosed}
      >
        <SheetHeader className="border-b border-hairline px-5 pt-5 pr-14 pb-4">
          <SheetTitle className="text-xl font-bold">Ask about this bill</SheetTitle>
          <SheetDescription className="text-base text-ink-2">{card.card.title}</SheetDescription>
        </SheetHeader>
        {/* A new conversation for each vote. */}
        <Conversation key={card.id} card={card} onChoose={onChoose} />
      </SheetContent>
    </Sheet>
  );
}

function Conversation({
  card,
  onChoose,
}: {
  card: CardView;
  onChoose: (choice: "Yea" | "Nay", weight: Weight | null) => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSent = useRef("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport<DecideUIMessage>({
        api: "/api/decide",
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
          body: { id, keyVoteId: card.id, messages: fitHistory(messages), trigger, messageId },
        }),
      }),
    [card.id],
  );
  const { messages, sendMessage, status, error, regenerate, clearError, setMessages } =
    useChat<DecideUIMessage>({
      transport,
      onError: () => {
        setMessages((current) =>
          current.at(-1)?.role === "user" ? current.slice(0, -1) : current,
        );
        setInput((current) => (current.trim() ? current : lastSent.current));
      },
    });
  const busy = status === "submitted" || status === "streaming";
  const last = messages.at(-1);

  const send = (text: string) => {
    const message = text.trim().slice(0, MAX_MESSAGE);
    if (busy) return;
    if (!message) {
      inputRef.current?.focus();
      return;
    }
    clearError();
    lastSent.current = message;
    void sendMessage({ text: message });
    setInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
        role="log"
        aria-live="off"
        aria-busy={busy}
        aria-label="Conversation"
      >
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-base text-ink-2">
              Ask anything about this bill in plain words. Tell me what matters to you, and I can
              suggest the answer that fits. You still choose.
            </p>
            <ul className="flex flex-col border-t border-hairline">
              {STARTERS.map((starter) => (
                <li key={starter} className="border-b border-hairline">
                  <button
                    type="button"
                    onClick={() => send(starter)}
                    className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center rounded-control px-2 py-2.5 text-left text-base font-semibold text-ink can-hover:bg-accent"
                  >
                    {starter}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((message, index) =>
          message.role === "user" ? (
            <h3
              key={message.id}
              className="text-lg leading-snug font-extrabold tracking-tight text-pretty text-ink"
            >
              <span className="sr-only">You asked: </span>
              {textOf(message)}
            </h3>
          ) : (
            <Reply
              key={message.id}
              message={message}
              pending={busy && index === messages.length - 1}
              onChoose={onChoose}
              onKeepTalking={() => inputRef.current?.focus()}
            />
          ),
        )}
        {busy && last?.role === "user" && (
          <div className="flex flex-col gap-4 border-t-2 border-ink pt-4">
            <OvalLoader label="Reading the bill" />
          </div>
        )}
        {error && (
          <div role="alert" className="flex flex-col gap-3 border-t-2 border-ink pt-4">
            <p className="text-base text-ink">{errorText(error)}</p>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => {
                if (last?.role === "assistant") {
                  clearError();
                  void regenerate();
                } else send(input);
              }}
            >
              <RotateCcw aria-hidden />
              Try again
            </Button>
          </div>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="border-t border-hairline bg-canvas px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-1 rounded-control border border-ink bg-paper p-1.5 pl-2 has-[textarea:focus-visible]:ring-1 has-[textarea:focus-visible]:ring-ink">
          <label htmlFor="talk-input" className="sr-only">
            Your message
          </label>
          <textarea
            id="talk-input"
            ref={inputRef}
            value={input}
            maxLength={MAX_MESSAGE}
            rows={1}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask about this bill"
            className="field-sizing-content max-h-32 min-h-11 resize-none bg-transparent px-1 py-2.5 text-base text-ink placeholder:text-ink-3 focus-visible:outline-none"
          />
          <Button
            type="submit"
            size="icon"
            variant={input.trim() === "" && !busy ? "outline" : "default"}
            aria-disabled={busy || undefined}
            className={cn(busy && "cursor-progress")}
          >
            {busy ? <InlineOvalLoader size={20} /> : <ArrowUp strokeWidth={2.25} aria-hidden />}
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </form>
    </div>
  );
}

/** One reply: its sentences, then a suggested answer when the model gave one. */
function Reply({
  message,
  pending,
  onChoose,
  onKeepTalking,
}: {
  message: DecideUIMessage;
  pending: boolean;
  onChoose: (choice: "Yea" | "Nay", weight: Weight | null) => void;
  onKeepTalking: () => void;
}) {
  if (pending)
    return (
      <div className="flex flex-col gap-4 border-t-2 border-ink pt-4">
        <OvalLoader label="Reading the bill" />
      </div>
    );
  const text = textOf(message);
  const suggestion = message.parts
    .filter(isToolUIPart)
    .flatMap((part) => (part.state === "output-available" ? [part.output as DecideSuggestion] : []))
    .at(-1);
  return (
    <article className="flex flex-col gap-4 border-t-2 border-ink pt-4" aria-label="For The People">
      {text && (
        <p className="animate-answer-in text-base leading-relaxed text-ink motion-reduce:animate-none">
          {text}
        </p>
      )}
      {suggestion && (
        <Suggestion suggestion={suggestion} onChoose={onChoose} onKeepTalking={onKeepTalking} />
      )}
    </article>
  );
}

/**
 * A suggested answer: the reason, then both answers with their ballot ovals. The suggested one is the
 * one ink button, its oval already marked; the other stays an outlined choice. Nothing is saved until
 * the voter chooses.
 */
function Suggestion({
  suggestion,
  onChoose,
  onKeepTalking,
}: {
  suggestion: DecideSuggestion;
  onChoose: (choice: "Yea" | "Nay", weight: Weight | null) => void;
  onKeepTalking: () => void;
}) {
  const sides: Array<"Yea" | "Nay"> = suggestion.choice === "Yea" ? ["Yea", "Nay"] : ["Nay", "Yea"];
  return (
    <section
      aria-label={`Suggested answer: ${suggestion.choice}`}
      className="flex animate-answer-in flex-col gap-3 rounded-card border border-hairline bg-canvas p-4 motion-reduce:animate-none"
    >
      <p className="text-sm font-semibold text-ink-2">
        Suggested from what you said: {suggestion.choice}
      </p>
      <p className="text-base text-ink">{suggestion.reason}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {sides.map((side) => {
          const suggested = side === suggestion.choice;
          return (
            <Button
              key={side}
              type="button"
              size="lg"
              variant={suggested ? "default" : "outline"}
              onClick={() => onChoose(side, suggestion.weight)}
              className="flex-1 gap-3"
            >
              <Oval
                filled={suggested}
                tone={suggested ? "you" : "ink"}
                size={26}
                stroke={2}
                animate={false}
              />
              Choose {side}
            </Button>
          );
        })}
      </div>
      <Button type="button" variant="link" className="w-fit" onClick={onKeepTalking}>
        Keep talking
      </Button>
    </section>
  );
}
