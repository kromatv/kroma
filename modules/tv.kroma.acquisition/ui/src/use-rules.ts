import type { RequestKind } from '@kromatv/client/requests';
import { useFetch, usePoll } from '@kromatv/module-sdk';
import { useAcquisitionApi } from './api';

const LIST_MS = 60_000;

export function useRules() {
  const acquisition = useAcquisitionApi();
  return useFetch(['admin', 'acquisition', 'rules'], () => acquisition.rules());
}

export function useCutoffTitles() {
  const acquisition = useAcquisitionApi();
  return usePoll(['admin', 'acquisition', 'cutoff'], () => acquisition.cutoff(), LIST_MS);
}

export function useBlocklist() {
  const acquisition = useAcquisitionApi();
  return usePoll(['admin', 'acquisition', 'blocklist'], () => acquisition.blocklist(), LIST_MS);
}

export function useTitleRules(kind: RequestKind, tmdbId: number) {
  const acquisition = useAcquisitionApi();
  return useFetch(['admin', 'acquisition', 'title', kind, tmdbId], () =>
    acquisition.titleRules(kind, tmdbId),
  );
}
