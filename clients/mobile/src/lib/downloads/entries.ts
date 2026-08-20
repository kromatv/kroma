import { useCallback, useEffect, useRef, useState } from 'react';
import { type DownloadEntry, deleteEntryFiles, readIndex, writeIndex } from './store';

export interface EntryIndex {
  entries: DownloadEntry[];
  hasEntry(itemId: string): boolean;
  upsertEntry(itemId: string, entry: DownloadEntry): void;
  remove(itemId: string): Promise<void>;
}

export function useEntries(): EntryIndex {
  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  // Mirrors `entries` for the handlers, keeping persistence out of the state
  // updater: a reducer that also writes files runs twice under StrictMode.
  const entriesRef = useRef<DownloadEntry[]>([]);

  // The index is readable without a session, so downloaded titles show up even
  // when the app launches offline; reconciliation waits for the client.
  useEffect(() => {
    void (async () => {
      const stored = await readIndex();
      // A fast adoption may have committed an entry already; never clobber it.
      if (entriesRef.current.length === 0) {
        entriesRef.current = stored;
        setEntries(stored);
      }
    })();
  }, []);

  const commitEntries = useCallback((next: DownloadEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
    void writeIndex(next);
  }, []);

  const hasEntry = useCallback(
    (itemId: string) => entriesRef.current.some((e) => e.itemId === itemId),
    [],
  );

  const upsertEntry = useCallback(
    (itemId: string, entry: DownloadEntry) => {
      commitEntries([...entriesRef.current.filter((e) => e.itemId !== itemId), entry]);
    },
    [commitEntries],
  );

  const remove = useCallback(
    async (itemId: string) => {
      const entry = entriesRef.current.find((e) => e.itemId === itemId);
      commitEntries(entriesRef.current.filter((e) => e.itemId !== itemId));
      if (entry) await deleteEntryFiles(entry);
    },
    [commitEntries],
  );

  return { entries, hasEntry, upsertEntry, remove };
}
