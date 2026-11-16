import { useLocation, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ApiError, sendProposal } from '#site/lib/api-client';
import { type Returned, returnedFrom, SEND_FAILURES } from '#site/lib/send-return';

/** Where the viewer's send stands: on its way, in a pull request, declined at GitHub, or refused. */
export type Sending =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; number: number }
  | { kind: 'declined' }
  | { kind: 'failed'; message: string };

/** How a send reaches GitHub: from the contributor's fork, or through Lingua's App. */
export type SendVia = 'fork' | 'lingua';

function sendingOf(returned: Returned | null): Sending {
  if (!returned || returned.kind === 'nothing') {
    return { kind: 'idle' };
  }
  if (returned.kind === 'failed') {
    return { kind: 'failed', message: SEND_FAILURES[returned.reason] };
  }
  return returned;
}

function useReturnedSend(): Sending {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useLocation({ select: (location) => location.searchStr });
  const [returned] = useState(() => sendingOf(returnedFrom(search)));
  useEffect(() => {
    if (returnedFrom(search)) {
      router.history.replace(pathname);
    }
  }, [router, pathname, search]);
  return returned;
}

/**
 * The viewer's send for one language. `send` asks GitHub's permission and
 * leaves for it, unless `via` is `lingua`; a send that comes back from GitHub
 * starts the bar in the state it came back in.
 */
export function useSending(target: Readonly<{ project: string; locale: string }>) {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  const returned = useReturnedSend();
  const [sending, setSending] = useState<Sending>(returned);

  const send = async (via: SendVia) => {
    setSending({ kind: 'sending' });
    try {
      const result = await sendProposal({ ...target, via, to: pathname });
      if (result.kind === 'authorize') {
        window.location.assign(result.url);
        return;
      }
      setSending(
        result.kind === 'proposed' ? { kind: 'sent', number: result.number } : { kind: 'idle' },
      );
      await router.invalidate();
    } catch (error: unknown) {
      const message = error instanceof ApiError ? error.message : 'Sending failed. Try again.';
      setSending({ kind: 'failed', message });
    }
  };

  return { sending, send };
}
