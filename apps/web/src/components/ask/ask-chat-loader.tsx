"use client";

import { lazy, Suspense, useState, type ComponentProps } from "react";
import type { AskChat as AskChatComponent } from "@/components/ask/ask-chat";
import { useHydrated } from "@/hooks/use-hydrated";

/** The chat once its chunk has loaded, so a later visit renders it at once instead of suspending. */
let ready: typeof AskChatComponent | null = null;
const load = () =>
  import("@/components/ask/ask-chat").then((module) => {
    ready = module.AskChat;
    return module.AskChat;
  });

/**
 * Starts loading the chat when someone reaches for Ask (hover, touch, or focus on a link to it), so
 * the composer is there when the page arrives instead of after a skeleton.
 */
export function preloadAskChat() {
  if (!ready) void load();
}

const AskChat = lazy(() => load().then((component) => ({ default: component })));

/**
 * Ask's chat client (the AI SDK and the answer cards) loads once the page is interactive, so the
 * page stays inside the first-load JavaScript budget. Until then the skeleton
 * holds its place.
 */
export function AskChatLoader({
  skeleton,
  ...props
}: ComponentProps<typeof AskChatComponent> & { skeleton: React.ReactNode }) {
  const hydrated = useHydrated();
  // Chosen once per visit: the loaded chat renders without suspending (no skeleton flash), and the
  // component type never changes under a conversation in progress.
  const [Chat] = useState(() => ready ?? AskChat);
  if (!hydrated) return skeleton;
  return (
    <Suspense fallback={skeleton}>
      <Chat {...props} />
    </Suspense>
  );
}
