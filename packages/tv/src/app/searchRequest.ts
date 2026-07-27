// "Someone asked us to search for this."
//
// A search can arrive from outside the app, and the app should not care which
// outside: on Apple TV it is Siri (the shell hands over what the user said to
// the Siri Remote), and the same door is what a paired phone or a launcher tile
// would use. So this is a request, not a Siri API - one function a shell calls,
// one subscription the app answers with.
//
// It is a module-level bus rather than a context on purpose: the request usually
// arrives BEFORE React is ready. Siri launches a cold app to handle an intent,
// which means the query exists while there is still no tree to put it in. So a
// request that nobody is listening to is kept, and handed to the first listener
// that shows up (`onSearchRequest` replays it) or read straight out by the
// search screen when it mounts.

type Listener = (query: string) => void;

let pending: string | null = null;
const listeners = new Set<Listener>();

/** Ask the app to search for `query`. Called by a shell, from outside React. */
export function requestSearch(query: string): void {
  const q = query.trim();
  if (!q) return;
  // Kept even when it is delivered: the listener navigates to the search screen,
  // and the screen itself reads the query when it mounts, one turn later.
  pending = q;
  for (const listener of listeners) listener(q);
}

/** React to search requests (the app navigates to the search screen). A request
 * that arrived before anyone was listening is replayed immediately. */
export function onSearchRequest(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

/** The requested query, once. The search screen calls this as it mounts, which
 * is also what clears it: a query must not come back on the next visit. */
export function takePendingSearch(): string | null {
  const q = pending;
  pending = null;
  return q;
}
