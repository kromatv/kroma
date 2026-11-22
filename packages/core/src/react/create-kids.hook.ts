import type { NewKidsProfile } from '@kromatv/client/admin';
import { useState } from 'react';
import { type KidsForm, kidsDraft } from '../auth/kids';

/** What a client lends {@link useCreateKids}: the call that makes the
 *  profile, the words for a refusal, and what follows once it is made. */
export interface CreateKidsHost {
  createKids: (draft: NewKidsProfile) => Promise<unknown>;
  refusal: (error: unknown) => string;
  onCreated: () => void;
}

/** Sends a Kids form to the server once it holds a name and a level, and keeps
 *  what the form shows meanwhile: `busy` while it is sent, `error` when the
 *  server refused it. */
export function useCreateKids(host: CreateKidsHost) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async (form: KidsForm) => {
    const draft = kidsDraft(form);
    if (!draft || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await host.createKids(draft);
      host.onCreated();
    } catch (error_) {
      setError(host.refusal(error_));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, create };
}
