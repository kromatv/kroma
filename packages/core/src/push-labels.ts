// What each push blocker is called, once.
//
// Lives in `core` rather than `client` because it is the one piece of the push
// story that needs the i18n catalogue: `client` sits underneath i18n and cannot
// name a `MessageKey`.
//
// Shared for the same reason the blocker vocabulary is: a user who cannot turn
// push on should get the same explanation whichever KROMA they are looking at,
// and a new reason should be impossible to add without writing its copy — which
// the exhaustive `Record` below enforces at build time.

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
