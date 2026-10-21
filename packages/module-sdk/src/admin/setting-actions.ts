import type { KromaClient } from '@kromatv/client';
import type { MessageKey } from '@kromatv/i18n';
import type { useT } from '@kromatv/ui';

// An `action` row's server call and strings, keyed by the row's `key`. Core
// actions live here; a module page renders its own buttons rather than
// registering here.
type T = ReturnType<typeof useT>;
export interface ActionSpec {
  label: MessageKey;
  running: MessageKey;
  failed: MessageKey;
  run: (client: KromaClient) => Promise<{ sentTo: string; asked?: boolean }>;
  ok: (t: T, r: { sentTo: string; asked?: boolean }) => string;
}
export const ACTIONS: Record<string, ActionSpec> = {
  smtpTest: {
    label: 'admin.smtpTestRun',
    running: 'admin.smtpTestSending',
    failed: 'admin.smtpTestFailed',
    run: (client) => client.admin.testSmtp(),
    ok: (t, r) => t('admin.smtpTestOk', { email: r.sentTo }),
  },
  relayTest: {
    label: 'admin.relayTestRun',
    running: 'admin.relayTestSending',
    failed: 'admin.relayTestFailed',
    run: (client) => client.admin.testRelay(),
    ok: (t, r) =>
      r.asked
        ? t('admin.relayTestAsked', { email: r.sentTo })
        : t('admin.relayTestOk', { email: r.sentTo }),
  },
};
