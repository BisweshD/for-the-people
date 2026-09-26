"use client";

import { useSyncExternalStore } from "react";

/**
 * Toasts without shipping the toast library on first load: the first call mounts the Toaster
 * (loaded on demand by ToastHost in Providers) and then shows the message. Same call shape as
 * sonner's `toast` for the forms we use, including one action button ("Undo").
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  description?: string;
  /** One button in the toast. A toast with an action stays up longer, so there is time to reach it. */
  action?: ToastAction;
}

/** How long a toast with an action stays up (sonner's default of 4 s is short for an Undo). */
export const ACTION_TOAST_MS = 8000;

let wanted = false;
const listeners = new Set<() => void>();
let resolveMounted: (() => void) | null = null;
const mounted = new Promise<void>((resolve) => {
  resolveMounted = resolve;
});

export function subscribeToaster(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useToasterWanted = (): boolean =>
  useSyncExternalStore(
    subscribeToaster,
    () => wanted,
    () => false,
  );

/** Called by the Toaster once it is on the page. */
export function markToasterMounted(): void {
  resolveMounted?.();
}

/** Turns our options into sonner's: the action keeps its label and runs its callback once. */
export function toSonnerOptions(options?: ToastOptions) {
  if (!options) return undefined;
  const { action, ...rest } = options;
  if (!action) return rest;
  return {
    ...rest,
    duration: ACTION_TOAST_MS,
    action: { label: action.label, onClick: () => action.onClick() },
  };
}

async function show(kind: "message" | "success", message: string, options?: ToastOptions) {
  if (!wanted) {
    wanted = true;
    for (const listener of listeners) listener();
  }
  const [{ toast: sonner }] = await Promise.all([import("sonner"), mounted]);
  const settings = toSonnerOptions(options);
  if (kind === "success") sonner.success(message, settings);
  else sonner(message, settings);
}

export const toast = Object.assign(
  (message: string, options?: ToastOptions) => void show("message", message, options),
  { success: (message: string, options?: ToastOptions) => void show("success", message, options) },
);
