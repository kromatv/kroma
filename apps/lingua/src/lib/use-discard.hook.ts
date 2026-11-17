import { useConfirm } from '@kromatv/ui/kit/organisms/dialog';
import { toast } from '@kromatv/ui/kit/organisms/toast';
import { useLocation, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, type Discarded, discardDrafts } from '#site/lib/api-client';
import { type DiscardTarget, discardedMessage, discardQuestion } from '#site/lib/discard-question';
import { projectParams } from '#site/lib/project-id';

function inLanguage(pathname: string, { project, locale }: DiscardTarget): boolean {
  const base = `/${project}/${locale}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

function failed(error: unknown): void {
  const detail = error instanceof ApiError ? error.message : 'Check your connection and try again.';
  toast({ message: 'Not discarded', detail, icon: 'alert-triangle' });
}

function useSettle(target: DiscardTarget) {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  return async (result: Discarded) => {
    if (result.removed && inLanguage(pathname, target)) {
      await router.navigate({ to: '/$owner/$repo', params: projectParams(target.project) });
      return;
    }
    await router.invalidate();
  };
}

/**
 * Throws away the viewer's unsent changes in one language, once they say so.
 * A language that went with them leaves its pages for the project's.
 */
export function useDiscard(target: DiscardTarget) {
  const confirm = useConfirm();
  const settle = useSettle(target);
  const [busy, setBusy] = useState(false);

  const discard = async () => {
    if (!(await confirm(discardQuestion(target)))) {
      return;
    }
    setBusy(true);
    try {
      const result = await discardDrafts({ project: target.project, locale: target.locale });
      toast({ message: discardedMessage(target, result), icon: 'trash' });
      await settle(result);
    } catch (error: unknown) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  return { discard, busy };
}
