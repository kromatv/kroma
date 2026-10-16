import type { RequestLedgerView } from '@kromatv/client/requests';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Button, Surface, Text } from '@kromatv/ui/kit';
import { Pill } from '#web/features/admin/pill';
import { kindMeta } from '#web/features/admin/pipeline-meta';
import { posterScrim } from '#web/shared/lib/art-styles';
import { Image } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

export function TitleIdentityCard({ ledger }: Readonly<{ ledger: RequestLedgerView }>) {
  const t = useT();
  const km = kindMeta(ledger.kind === 'show' ? 'series' : 'film');
  return (
    <Surface elevated radius="xl" pad="lg">
      <Box row gap={16}>
        <Box w={70} h={104} shrink={0} radius="xs" overflow="hidden">
          <Box fill style={posterScrim(ledger.title)} />
          <Image src={ledger.posterUrl} fit="cover" fill />
        </Box>
        <Box minW={0} pt={4} align="flex-start" gap={10}>
          <Pill ink={km.color} bg={km.bg} variant="overline">
            {t(`pipeline.type.${km.typeKey}` as MessageKey)}
          </Pill>
          {ledger.year ? (
            <Text variant="meta" color="textDim">
              {String(ledger.year)}
            </Text>
          ) : null}
          {ledger.localId ? (
            <Button
              variant="ghost"
              size="sm"
              icon="external-link"
              label={t('monitoring.openInLibrary')}
              asChild
            >
              {ledger.kind === 'show' ? (
                <RouteLink to="/shows/$id" params={{ id: ledger.localId }} />
              ) : (
                <RouteLink to="/movies/$id" params={{ id: ledger.localId }} />
              )}
            </Button>
          ) : null}
        </Box>
      </Box>
      {ledger.overview ? (
        <Text variant="meta" color="textDim" mt={14} lines={6}>
          {ledger.overview}
        </Text>
      ) : null}
    </Surface>
  );
}
