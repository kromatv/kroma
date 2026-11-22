import type { SetupAnswer, SetupConfirmed, SetupStart, SetupStep } from '@kromatv/client/setup';
import { useRef } from 'react';
import { isAuthed } from '#web/shared/lib/api';
import { useSetupAnswered } from '#web/shared/lib/setup-state';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** Tells the server where the owner is in their setup, so that another
 * browser resumes there and the dashboard knows what is left. Each call waits
 * for the one before, so the last answer kept is the server's last word. A
 * visitor before the owner account exists has nothing to tell, and a call
 * that fails leaves the owner where they are. */
export function useSetupMemory() {
  const { client } = useWebRuntime();
  const answered = useSetupAnswered();
  const queue = useRef<Promise<void>>(Promise.resolve());
  const tell = (call: () => Promise<SetupAnswer>) => {
    if (isAuthed()) {
      queue.current = queue.current.then(call).then(answered, () => undefined);
    }
    return queue.current;
  };
  return {
    advance: (step: SetupStep, start: SetupStart) =>
      tell(() => client.setup.advance({ step, start })),
    confirm: (step: SetupConfirmed) => tell(() => client.setup.confirm(step)),
    end: () => tell(() => client.setup.end()),
  };
}
