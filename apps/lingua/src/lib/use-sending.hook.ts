import { toast } from '@kromatv/ui/kit/organisms/toast';
import { useLocation, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ApiError, type Proposed, sendProposal } from '#site/lib/api-client';
import { type Returned, returnedFrom, SEND_FAILURES } from '#site/lib/send-return';

/** Where the viewer's send stands: on its way, in a pull request, declined at GitHub, or refused. */
export type Sending =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; number: number }
  | { kind: 'declined' }
  | { kind: 'failed'; message: string };

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

function announced(result: Exclude<Proposed, { kind: 'authorize' }>): Sending {
  if (result.kind !== 'proposed') {
    return { kind: 'idle' };
  }
  toast({
    message: `Sent to pull request #${result.number}`,
    tone: 'success',
    icon: 'git-pull-request',
  });
  return { kind: 'sent', number: result.number };
}

/**
 * The viewer's send for one language. `send` asks GitHub's permission and
 * leaves for it; a send that comes back from GitHub starts the bar in the
 * state it came back in.
 */
export function useSending(target: Readonly<{ project: string; locale: string }>) {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  const returned = useReturnedSend();
  const [sending, setSending] = useState<Sending>(returned);

  const send = async () => {
    setSending({ kind: 'sending' });
    try {
      const result = await sendProposal({ ...target, to: pathname });
      if (result.kind === 'authorize') {
        window.location.assign(result.url);
        return;
      }
      setSending(announced(result));
      await router.invalidate();
    } catch (error: unknown) {
      const message = error instanceof ApiError ? error.message : 'Sending failed. Try again.';
      setSending({ kind: 'failed', message });
      toast({ message: 'Not sent', detail: message, icon: 'alert-triangle' });
    }
  };

  return { sending, send };
}
