import type { Metadata } from "next";
import { CheatSheet } from "@/components/ballot/cheat-sheet";
import { STATE_OFFICES } from "@/server/ballot-reference";

export const metadata: Metadata = {
  title: "My ballot cheat sheet",
  description: "Your 2026 ballot plan, ready to print. It works offline after your first visit.",
};

/** A static shell: the plan is rendered on the device, so the service worker can serve this page offline. */
export default function CheatSheetPage() {
  return <CheatSheet offices={STATE_OFFICES} />;
}
