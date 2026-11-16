import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, saveEdit } from '#site/lib/api-client';
import type { Issue, RowView } from '#site/lib/views';

/** Where one message's edit is saved. */
export interface MessageTarget {
  project: string;
  locale: string;
  file: string;
}

/** How the last save of a message went. */
export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed'; message: string };

function failureOf(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Not saved. Check your connection and try again.';
  }
  if (error.status === 401) {
    return 'You are signed out. Sign in again to save this edit.';
  }
  return error.message;
}

/** One message's field: `commit` saves a changed value, and a dropped edit puts the branch's text back. */
export function useMessageSave(row: RowView, target: MessageTarget) {
  const router = useRouter();
  const [value, setValue] = useState(row.draft ?? row.current ?? '');
  const [kept, setKept] = useState(value);
  const [issues, setIssues] = useState<readonly Issue[]>(row.issues);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const commit = async () => {
    if (value === kept) {
      return;
    }
    const sent = value;
    setStatus({ kind: 'saving' });
    try {
      const saved = await saveEdit({ ...target, key: row.key, value: sent });
      const shown = saved.draft ?? row.current ?? '';
      setKept(shown);
      setValue((typing) => (typing === sent ? shown : typing));
      setIssues(saved.issues);
      setStatus({ kind: 'saved' });
      await router.invalidate();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.issues.length > 0) {
        setIssues(error.issues);
      }
      setStatus({ kind: 'failed', message: failureOf(error) });
    }
  };

  return { value, setValue, commit, issues, status };
}
