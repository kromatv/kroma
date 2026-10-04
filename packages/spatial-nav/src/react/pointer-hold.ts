import { HOLD_MS } from '@kromatv/spatial-nav';
import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent } from 'react-native';

interface PointerHold {
  down: (event: PointerEvent) => void;
  end: () => void;
  tookClick: () => boolean;
}

/** A pointer held on an item for {@link HOLD_MS} long-selects it, and the click
 *  its release produces is the hold's, not a select. */
function usePointerHold(onLongSelect: (() => void) | undefined): PointerHold {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const latest = useRef(onLongSelect);
  latest.current = onLongSelect;

  const end = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => end, [end]);

  return {
    down: (event) => {
      held.current = false;
      end();
      if (event.nativeEvent.button !== 0) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        held.current = true;
        latest.current?.();
      }, HOLD_MS);
    },
    end,
    tookClick: () => {
      const took = held.current;
      held.current = false;
      return took;
    },
  };
}

export { usePointerHold };
