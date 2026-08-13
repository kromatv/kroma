// The module page's recent-output panel: the tail of what this module's own
// process wrote, from the same in-memory ring the "Journaux" console reads,
// with the way through to that console already filtered to this module.

import { useT } from '@kroma/ui';
import { Box, Button, Row, Surface, Text } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { LogLines } from '#web/features/admin/log-lines';
import { Label } from '#web/features/admin/module-detail-sections';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

const LIMIT = 100;
const POLL_MS = 5000;

/** The last lines module `id` logged, refreshed while the page is open. */
export function ModuleLogs({ id }: Readonly<{ id: string }>) {
  const t = useT();
  const navigate = useNavigate();
  const { client } = useAuth();
  const { data } = usePoll(
    ['admin', 'logs', 'module', id],
    () => client.adminLogs({ source: id, limit: LIMIT }),
    POLL_MS,
  );
  const entries = data?.entries ?? [];

  return (
    <Box>
      <Row between align="center">
        <Label>{t('admin.modulesLogs')}</Label>
        <Button
          variant="ghost"
          size="sm"
          icon="terminal-2"
          label={t('admin.modulesLogsOpenAll')}
          onPress={() => void navigate({ to: '/admin/logs', search: { source: id } })}
        />
      </Row>
      <Text variant="meta" color="textMuted" mb={12}>
        {t('admin.modulesLogsHint')}
      </Text>
      <Surface tone="outline" pad="none" overflow="hidden">
        {entries.length === 0 ? (
          <Text variant="meta" color="textDim" px={16} py={20}>
            {t('admin.modulesLogsEmpty')}
          </Text>
        ) : (
          <LogLines entries={entries} maxHeight={320} follow />
        )}
      </Surface>
    </Box>
  );
}
