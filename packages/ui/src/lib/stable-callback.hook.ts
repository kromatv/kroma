import { useCallback, useLayoutEffect, useRef } from 'react';

/** One function identity, forever, whose body always sees the latest render's
 *  values. Reach for it when the FUNCTION ITSELF is a prop, and a moving
 *  identity would re-render a memoised child or a whole list.
 *
 *  `useEffectEvent` is not a substitute: React returns a NEW closure from it on
 *  every render (`updateEvent` in react-dom), which is why React's own advice is
 *  not to pass an effect event to another component. Keep effect events for
 *  reading fresh values inside an effect. */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R) {
  const latest = useRef(fn);
  // Written in an effect, never during render: a ref the render phase touches
  // is what makes the React Compiler skip the whole component.
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
