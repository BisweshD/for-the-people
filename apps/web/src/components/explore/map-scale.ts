/** Shared by the lazy map and the panel around it, so the panel never pulls in the atlas. */

/** The us-atlas projection's own size. */
export const MAP_WIDTH = 975;
export const MAP_HEIGHT = 610;
/** Room in the Atlantic for the northeast callouts (labels with leader lines). */
export const CALLOUT_WIDTH = 160;
/** The drawn view: the map plus the callout column. */
export const VIEW_WIDTH = MAP_WIDTH + CALLOUT_WIDTH;
