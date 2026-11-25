import { useLocale, useT } from '@kromatv/ui';
import { formatGigabytes } from '@kromatv/ui/intl';
import { useCallback } from 'react';

function gigabytesOf(limit: string): number | null {
  const lead = /^[\d.]+/.exec(limit.trim());
  const gigabytes = lead ? Number(lead[0]) : Number.NaN;
  return gigabytes > 0 ? gigabytes : null;
}

/** Names a cache limit stored the way the server reads it (`"40 Go"`, any
 *  other word for no limit) in the reader's units. */
export function useCacheLimitName(): (limit: string) => string {
  const t = useT();
  const locale = useLocale();
  return useCallback(
    (limit: string) => {
      const gigabytes = gigabytesOf(limit);
      return gigabytes === null ? t('opt.unlimited') : formatGigabytes(gigabytes, locale);
    },
    [t, locale],
  );
}
