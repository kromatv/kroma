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
export type SaveStatus = { kind: 'idle' } | { kind: 'saved' } | { kind: 'failed'; message: string };

function failureOf(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Not saved. Check your connection and try again.';
  }
  if (error.status === 401) {
    return 'You are signed out. Sign in again to save this edit.';
  }
  return error.message;
}

interface Saving {
  kept: string;
  issues: readonly Issue[];
  status: SaveStatus;
}

function refusal(before: Saving, error: unknown): Saving {
  const issues =
    error instanceof ApiError && error.issues.length > 0 ? error.issues : before.issues;
  return { ...before, issues, status: { kind: 'failed', message: failureOf(error) } };
}

/**
 * One message's field. `commit` shows a changed value saved at once and saves
 * it behind; a refusal keeps the text, says why, and lets the next commit try
 * again. A dropped edit puts the branch's text back.
 */
export function useMessageSave(row: RowView, target: MessageTarget) {
  const router = useRouter();
  const [value, setValue] = useState(row.draft ?? row.current ?? '');
  const [saving, setSaving] = useState<Saving>({
    kept: value,
    issues: row.issues,
    status: { kind: 'idle' },
  });

  const commit = async () => {
    if (value === saving.kept) {
      return;
    }
    const [sent, before] = [value, saving];
    setSaving({ ...before, kept: sent, status: { kind: 'saved' } });
    try {
      const saved = await saveEdit({ ...target, key: row.key, value: sent });
      const shown = saved.draft ?? row.current ?? '';
      setSaving({ kept: shown, issues: saved.issues, status: { kind: 'saved' } });
      setValue((typing) => (typing === sent ? shown : typing));
      await router.invalidate();
    } catch (error: unknown) {
      setSaving(refusal(before, error));
    }
  };

  return { value, setValue, commit, issues: saving.issues, status: saving.status };
}
