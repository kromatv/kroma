// A search asked for from outside the app (Siri, a paired phone, a launcher
// tile). Module-level rather than a context because Siri cold-launches the app
// to handle an intent: the query exists before there is a tree to put it in, so
// a request nobody is listening to is kept and replayed.

type Listener = (query: string) => void;

let pending: string | null = null;
const listeners = new Set<Listener>();

/** Ask the app to search for `query`. Called by a shell, from outside React. */
export function requestSearch(query: string): void {
  const q = query.trim();
  if (!q) return;
  // Kept even when delivered: the screen the listener navigates to reads the
  // query itself, one turn later.
  pending = q;
  for (const listener of listeners) listener(q);
}

/** A request that arrived before anyone was listening is replayed immediately. */
export function onSearchRequest(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

/** The requested query, once: reading it clears it, so it cannot come back on
 * the next visit. */
export function takePendingSearch(): string | null {
  const q = pending;
  pending = null;
  return q;
}
