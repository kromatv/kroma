import { useEffect, useRef } from 'react';
import { webDocument } from './dom';
import { useStableCallback } from './stable-callback';

/**
 * A hover handler that ignores what arrives under a pointer at rest. A browser
 * reports a hover whenever a row appears or scrolls under a still pointer, though
 * nobody pointed at anything. The pointer counts as at rest from the start and from
 * every key press until it next moves, and moving it picks up what it rested on.
 */
function useDeliberateHover<T>(onHover: (target: T) => void): (target: T) => void {
  const atRest = useRef(true);
  const under = useRef<T | null>(null);
  const report = useStableCallback(onHover);

  useEffect(() => {
    const document = webDocument();
    if (!document) {
      atRest.current = false;
      return;
    }
    const onMove = () => {
      atRest.current = false;
      if (under.current !== null) report(under.current);
      under.current = null;
    };
    const onKey = () => {
      atRest.current = true;
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [report]);

  return useStableCallback((target: T) => {
    if (atRest.current) under.current = target;
    else report(target);
  });
}

export { useDeliberateHover };
