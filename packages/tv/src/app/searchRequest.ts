import { createContext, useContext } from 'react';

type Listener = (query: string) => void;

/** Created by the shell before its native listeners start; owned by that root. */
export function createSearchRequests() {
  let pending: string | null = null;
  const listeners = new Set<Listener>();

  /** Ask the app to search for `query`. Called by a shell, from outside React. */
  function requestSearch(query: string): void {
    const q = query.trim();
    if (!q) return;
    // Kept even when delivered: the screen the listener navigates to reads the
    // query itself, one turn later.
    pending = q;
    for (const listener of listeners) listener(q);
  }

  /** A request that arrived before anyone was listening is replayed immediately. */
  function onSearchRequest(listener: Listener): () => void {
    listeners.add(listener);
    if (pending) listener(pending);
    return () => {
      listeners.delete(listener);
    };
  }

  /** The requested query, once: reading it clears it, so it cannot come back on
   * the next visit. */
  function takePendingSearch(): string | null {
    const q = pending;
    pending = null;
    return q;
  }

  let listening = false;
  const listenListeners = new Set<() => void>();

  /** Ask the app to open the search screen already listening. Called by a shell, from outside React. */
  function requestListening(): void {
    listening = true;
    for (const listener of listenListeners) listener();
  }

  /** A request that arrived before anyone was listening is replayed immediately. */
  function onListenRequest(listener: () => void): () => void {
    listenListeners.add(listener);
    if (listening) listener();
    return () => {
      listenListeners.delete(listener);
    };
  }

  /** Whether a listen request is waiting, once: reading it clears it. */
  function takePendingListen(): boolean {
    const was = listening;
    listening = false;
    return was;
  }

  return {
    requestSearch,
    onSearchRequest,
    takePendingSearch,
    requestListening,
    onListenRequest,
    takePendingListen,
  };
}
export type SearchRequests = ReturnType<typeof createSearchRequests>;
const Context = createContext<SearchRequests | null>(null);
export const SearchRequestsProvider = Context.Provider;
export function useSearchRequests(): SearchRequests {
  const requests = useContext(Context);
  if (!requests) throw new Error('Search requires SearchRequestsProvider');
  return requests;
}
