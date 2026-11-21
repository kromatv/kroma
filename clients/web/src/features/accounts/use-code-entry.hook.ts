import { useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

export type CodeStatus = 'idle' | 'ok' | 'err';

export interface CodeEntryState {
  code: string;
  status: CodeStatus;
  busy: boolean;
  edit: (value: string) => void;
  submit: (value?: string) => Promise<void>;
}

export function useCodeEntry(initial: string): CodeEntryState {
  const { client } = useAuth();
  const [code, setCode] = useState(initial);
  const [status, setStatus] = useState<CodeStatus>('idle');
  const [busy, setBusy] = useState(false);

  const edit = (value: string) => {
    setCode(value);
    setStatus('idle');
  };

  const submit = async (value?: string) => {
    const typed = (value ?? code).trim();
    if (!typed) {
      return;
    }
    setBusy(true);
    setStatus('idle');
    try {
      await client.accounts.quickConnect.authorize(typed);
      setStatus('ok');
    } catch {
      setStatus('err');
    } finally {
      setBusy(false);
    }
  };

  return { code, status, busy, edit, submit };
}
