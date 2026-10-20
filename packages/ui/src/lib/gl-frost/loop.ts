type Schedule = (tick: (now: number) => void) => number;

/** A requestAnimationFrame loop that runs only while its tick asks for another frame. */
export interface FrameLoop {
  request(): void;
  stop(): void;
}

/** `tick` draws one frame and answers whether something is still moving. */
export function createFrameLoop(
  tick: (now: number) => boolean,
  schedule: Schedule,
  cancel: (handle: number) => void,
): FrameLoop {
  let handle: number | null = null;
  const run = (now: number) => {
    handle = null;
    if (tick(now)) handle = schedule(run);
  };
  return {
    request() {
      handle ??= schedule(run);
    },
    stop() {
      if (handle !== null) cancel(handle);
      handle = null;
    },
  };
}
