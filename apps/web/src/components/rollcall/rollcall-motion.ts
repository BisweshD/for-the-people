import { animate } from "motion/react";
import { duration, easeIn, easeOut, spring } from "@/lib/motion";

/**
 * The animation engine for The Board and the hemicycle. Loaded on demand the first time either chart
 * scrolls into view, so it never weighs on first-load JS. Transform and opacity only.
 */

/** Clears the board, then lights each cell at its own delay, like members voting from the floor. */
export async function lightCells(
  lights: readonly HTMLElement[],
  delays: readonly number[],
): Promise<void> {
  await animate([...lights], { opacity: 0, scale: 0.6 }, { duration: duration.fast, ease: easeIn })
    .finished;
  await animate(
    [...lights],
    { opacity: [0, 1], scale: [0.6, 1] },
    { duration: duration.base, ease: easeOut, delay: (index: number) => delays[index] ?? 0 },
  ).finished;
}

export interface SeatFlight {
  element: SVGElement;
  /** Offset from the seat's place to where it starts, in SVG user units. */
  dx: number;
  dy: number;
  delay: number;
}

/** Seats fly in from the floor of the chamber and settle into their rows, party by party. */
export async function assembleSeats(flights: readonly SeatFlight[]): Promise<void> {
  await Promise.all(
    flights.map(
      ({ element, dx, dy, delay }) =>
        animate(
          element,
          { x: [dx, 0], y: [dy, 0], opacity: [0, 1] },
          { ...spring.soft, delay, opacity: { duration: duration.slow, delay, ease: easeOut } },
        ).finished,
    ),
  );
}
