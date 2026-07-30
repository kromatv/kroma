// What each push blocker is called, once. Lives in `core` rather than `client`
// because it needs the i18n catalogue, which sits above `client`. The
// exhaustive `Record` below makes a new blocker reason impossible to add
// without writing its copy.

import type { PushBlocker } from '@kroma/client';
import type { MessageKey } from './i18n';

/** The message explaining each reason push is unavailable. */
export const PUSH_BLOCKER_LABEL: Record<PushBlocker, MessageKey> = {
  unsupported: 'push.blocked.unsupported',
  insecure: 'push.blocked.insecure',
  'needs-install': 'push.blocked.needsInstall',
  'needs-rebuild': 'push.blocked.needsRebuild',
  simulator: 'push.blocked.simulator',
  denied: 'push.blocked.denied',
};

/** Whether a thrown error names a blocker, so a caller can look up its copy. */
export function blockerOf(error: unknown): PushBlocker | null {
  const message = error instanceof Error ? error.message : '';
  return message in PUSH_BLOCKER_LABEL ? (message as PushBlocker) : null;
}
