const TRANSITION_EVENTS = ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel'];

/** Stops CSS transition events at the window, before React's root listener
 *  dispatches them: nothing in the TV app listens for one, and a grid fades
 *  and scales its tiles with thousands of them. A component that needs to
 *  know a transition ended uses a timer, as the intro does. */
export function muteTransitionEvents(win: Window): () => void {
  const stop = (event: Event) => event.stopImmediatePropagation();
  for (const type of TRANSITION_EVENTS) win.addEventListener(type, stop, { capture: true });
  return () => {
    for (const type of TRANSITION_EVENTS) win.removeEventListener(type, stop, { capture: true });
  };
}
