import { describe, expect, test, vi } from "vitest";
import { ACTION_TOAST_MS, toSonnerOptions } from "./toast";

describe("toSonnerOptions", () => {
  test("a plain toast passes its description through", () => {
    expect(toSonnerOptions({ description: "Saved" })).toEqual({ description: "Saved" });
    expect(toSonnerOptions()).toBeUndefined();
  });

  test("an action becomes one sonner button that runs the callback, with more time to reach it", () => {
    const undo = vi.fn();
    const options = toSonnerOptions({ action: { label: "Undo", onClick: undo } });
    expect(options).toMatchObject({ duration: ACTION_TOAST_MS, action: { label: "Undo" } });
    const action = (options as { action: { onClick: () => void } }).action;
    action.onClick();
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
