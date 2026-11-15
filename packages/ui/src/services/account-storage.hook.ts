import { createAccountStorage } from '@kromatv/client/accounts';
import { useMemo } from 'react';
import { useDeviceStore } from '#ui/lib/device-store';

/** Session persistence follows the same root backend as UI preferences. */
export function useAccountStorage() {
  const storage = useDeviceStore();
  return useMemo(() => createAccountStorage(storage), [storage]);
}
