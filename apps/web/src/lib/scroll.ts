/**
 * Scrolls the window to `top` over `duration` ms with an ease-out curve, resolving when it arrives.
 * A duration of 0 jumps at once (reduced motion). The browser's smooth scroll has no fixed duration
 * or completion event, and the reorder on Matches has to wait for this one.
 */
export function scrollWindowTo(top: number, duration: number): Promise<void> {
  const from = window.scrollY;
  const target = Math.max(0, Math.min(top, document.documentElement.scrollHeight - innerHeight));
  if (duration <= 0 || Math.abs(target - from) < 2) {
    window.scrollTo({ top: target, behavior: "instant" });
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      window.scrollTo({ top: from + (target - from) * eased, behavior: "instant" });
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
