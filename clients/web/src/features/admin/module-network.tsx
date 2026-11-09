import { UNDECLARED_RULE } from '@kromatv/client/network';
import { useT } from '@kromatv/ui';
import { Box, Callout, Text } from '@kromatv/ui/kit';
import { usePoll } from '#web/features/admin/hooks';
import { Label } from '#web/features/admin/module-detail-sections';
import { NetworkDestinations } from '#web/features/admin/network-destinations';
import { FlowTable } from '#web/features/admin/network-flow-table';
import { useAuth } from '#web/shared/lib/auth';

const RECENT = 20;
const POLL_MS = 10000;
const RULES_POLL_MS = 60000;

/** What module `id` reached, and what it tried to reach without declaring it. */
export function ModuleNetwork({ id }: Readonly<{ id: string }>) {
  const t = useT();
  const { client } = useAuth();
  const { data } = usePoll(
    ['admin', 'network', 'flows', 'module', id],
    () => client.network.flows({ caller: id, limit: RECENT }),
    POLL_MS,
  );
  const { data: rules } = usePoll(
    ['admin', 'network', 'rules'],
    () => client.network.rules(),
    RULES_POLL_MS,
  );
  const flows = data?.flows ?? [];
  const undeclared = flows.filter((flow) => flow.rule === UNDECLARED_RULE).length;

  return (
    <Box gap={12}>
      <Label>{t('admin.modulesNetwork')}</Label>
      <Text variant="meta" color="textMuted">
        {t('admin.modulesNetworkHint')}
      </Text>
      {undeclared > 0 ? (
        <Callout.Root tone="danger">
          <Callout.Title>
            {t('admin.modulesNetworkUndeclared', { count: undeclared })}
          </Callout.Title>
        </Callout.Root>
      ) : null}
      <NetworkDestinations caller={id} />
      <Text variant="label" mt={8}>
        {t('admin.modulesNetworkRecent')}
      </Text>
      {flows.length === 0 ? (
        <Text variant="meta" color="textDim">
          {t('admin.modulesNetworkRecentEmpty')}
        </Text>
      ) : (
        <FlowTable flows={flows} rules={rules?.rules ?? []} />
      )}
    </Box>
  );
}
