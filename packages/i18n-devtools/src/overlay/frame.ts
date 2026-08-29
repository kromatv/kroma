/** Run `work` at most once a frame, however often it is asked for. Returns the
 *  ask, with `stop` to drop one that has not run yet. */
export function perFrame(work: () => void): { fire: () => void; stop: () => void } {
  let frame = 0;
  return {
    // Trailing, not leading: the page changing is what asks for this, and a
    // page is rebuilt over many frames at a time. Doing the work on the first
    // of them does it again on every one after, where waiting for the last
    // does it once.
    fire: () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        work();
      });
    },
    stop: () => {
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
