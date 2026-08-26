// A handler whose identity never moves, whose body always sees the newest
// render's values.
//
// `useEffectEvent` is NOT this, however much it reads like it. React returns a
// NEW closure from it on every render (`updateEvent` in react-dom), so handing
// one to a memoised child re-renders that child every time. React's own advice
// is not to pass an effect event to another component; this is the reason, and
// it is what made one keystroke re-render all forty keys of the on-screen
// keyboard even after the closures were lifted out of the grid.
//
// Use an effect event for what it is for: reading fresh values from inside an
// effect. Use this when the FUNCTION ITSELF is a prop.

import { useCallback, useLayoutEffect, useRef } from 'react';

/** One function, forever, that always calls the latest `fn`. */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R) {
  const latest = useRef(fn);
  // Written in an effect, never during render: a ref the render phase touches
  // is what makes the React Compiler skip the whole component.
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
