import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/module-sdk';
import { toast } from '@kromatv/ui/kit';
import { useCallback, useState } from 'react';
import type { SearchStarted } from './judgement-schemas';

const REASON_KEY: Record<string, string> = {
  busy: 'acq.notStarted.busy',
  noIndexer: 'acq.notStarted.noIndexer',
  vpnClosed: 'acq.notStarted.vpnClosed',
};

export interface SearchNowRunner {
  busy: boolean;
  start: (run: () => Promise<SearchStarted>) => void;
}

export function useSearchNow(): SearchNowRunner {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const start = useCallback(
    (run: () => Promise<SearchStarted>) => {
      setBusy(true);
      run()
        .then((answer) => toast(notice(t, answer)))
        .catch((error) =>
          toast({
            message: apiErrorText(error, t('requests.actionFailed')),
            icon: 'alert-triangle',
          }),
        )
        .finally(() => setBusy(false));
    },
    [t],
  );
  return { busy, start };
}

function notice(t: ReturnType<typeof useT>, answer: SearchStarted) {
  if (!answer.started) {
    return {
      message: t('acq.searchNotStarted'),
      detail: t(REASON_KEY[answer.reason ?? ''] ?? 'acq.notStarted.other'),
      icon: 'alert-triangle' as const,
    };
  }
  return {
    message: t('acq.searchStarted'),
    detail: answer.units == null ? undefined : t('acq.searchUnits', { count: answer.units }),
    icon: 'search' as const,
    tone: 'success' as const,
  };
}
