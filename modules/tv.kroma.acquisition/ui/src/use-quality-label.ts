import { useT } from '@kromatv/module-sdk';
import { useCallback } from 'react';
import { qualityLabel } from './fact-labels';

/** {@link qualityLabel} with the quality that names nothing read in the
 *  reader's own language. */
export function useQualityLabel(): (quality: string) => string {
  const t = useT();
  return useCallback((quality: string) => qualityLabel(quality) ?? t('acq.qualityUnknown'), [t]);
}
