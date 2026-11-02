import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { useConfirm } from '@kromatv/ui/kit';
import { useQueryClient } from '@tanstack/react-query';
import { useAsyncAction } from '#web/features/admin/hooks';
import { withHostRule } from '#web/features/admin/network-rules';
import { useAuth } from '#web/shared/lib/auth';

export type HostAction = 'block' | 'vpn';

/** Asks before writing a rule for one host, then writes it at the head of the
 * stored list. Reads the list fresh first, so an edit saved elsewhere since the
 * page loaded is kept. */
export function useHostRule(): {
  apply: (host: string, action: HostAction) => Promise<void>;
  busy: boolean;
  error: string | null;
} {
  const t = useT();
  const confirm = useConfirm();
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const { busy, error, run } = useAsyncAction();

  const apply = async (host: string, action: HostAction) => {
    const blocking = action === 'block';
    const ok = await confirm({
      title: blocking ? t('network.blockHostTitle', { host }) : t('network.vpnHostTitle', { host }),
      message: blocking ? t('network.blockHostMessage') : t('network.vpnHostMessage'),
      confirmLabel: blocking ? t('network.blockHost') : t('network.vpnHost'),
      cancelLabel: t('common.cancel'),
      destructive: blocking,
    });
    if (!ok) return;
    await run(
      async () => {
        const stored = await client.network.rules();
        await client.network.saveRules(withHostRule(stored, host, action));
        await queryClient.invalidateQueries({ queryKey: ['admin', 'network'] });
      },
      (cause) => apiErrorText(cause, t('network.saveFailed')),
    );
  };

  return { apply, busy, error };
}
