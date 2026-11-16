import { toast } from '@kromatv/ui/kit/organisms/toast';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, confirmMessages } from '#site/lib/api-client';

/** Confirms one message of a language as it reads, then reloads the page's data; `busy` while it asks. */
export function useConfirmMessage(target: Readonly<{ project: string; locale: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const confirm = async (key: string) => {
    setBusy(true);
    try {
      await confirmMessages({ ...target, keys: [key] });
      toast({
        message: 'Confirmed',
        detail: 'Send your changes to record it',
        tone: 'success',
        icon: 'circle-check',
      });
      await router.invalidate();
    } catch (error: unknown) {
      toast({
        message: 'Not confirmed',
        detail: error instanceof ApiError ? error.message : 'Check your connection and try again.',
        icon: 'alert-triangle',
      });
    } finally {
      setBusy(false);
    }
  };

  return { busy, confirm };
}
