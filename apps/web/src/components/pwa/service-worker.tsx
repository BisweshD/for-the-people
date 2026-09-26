"use client";

import { useEffect } from "react";

/** Registers public/sw.js, which keeps the ballot cheat sheet available offline. Renders nothing. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Private modes and some embedded browsers refuse service workers; the site works without one.
    });
  }, []);
  return null;
}
