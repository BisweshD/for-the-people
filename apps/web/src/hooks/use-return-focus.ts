"use client";

import { useRef } from "react";

/**
 * For dialogs and sheets opened without a Radix trigger: remember what had focus when the dialog
 * took it, and give focus back there on close (WCAG 2.4.3). When that element is gone (the opener
 * re-rendered as something else), `fallback` names where focus should go instead.
 */
export function useReturnFocus(fallback?: () => HTMLElement | null | undefined) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    },
    onCloseAutoFocus: (event: Event) => {
      const target = opener.current?.isConnected ? opener.current : fallback?.();
      if (!target) return;
      event.preventDefault();
      target.focus();
    },
  };
}
