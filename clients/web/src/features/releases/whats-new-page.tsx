import { useT } from '@kromatv/ui';
import { Box, EmptyState, PageHeader, Row, StatusDot, Text, useBreakpoint } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ReleaseArticle } from '#web/features/releases/release-article';
import { VersionList } from '#web/features/releases/version-list';
import { userQueries } from '#web/shared/lib/queries';
import { PageFrame } from '#web/shared/ui';

export function WhatsNewPage() {
  const t = useT();
  const step = useBreakpoint();
  const wide = step === 'lg' || step === 'tv';
  const { data, isPending } = useQuery(userQueries.releases());
  const [picked, setPicked] = useState<string | null>(null);
  const releases = data?.releases ?? [];
  const shown = releases.find(({ version }) => version === picked) ?? releases[0];

  return (
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title>{t('releases.title')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('releases.subtitle')}</PageHeader.Subtitle>
        {data ? (
          <PageHeader.Actions>
            <UpToDate version={data.current} />
          </PageHeader.Actions>
        ) : null}
      </PageHeader.Root>

      {data && shown ? (
        <Box row={wide} gap={wide ? 56 : 24} mt={40}>
          <VersionList
            releases={releases}
            current={data.current}
            selected={shown.version}
            onSelect={setPicked}
            horizontal={!wide}
          />
          <Box flex={wide} minW={0} maxW={760}>
            <ReleaseArticle release={shown} />
          </Box>
        </Box>
      ) : null}

      {isPending || shown ? null : (
        <Box mt={40}>
          <EmptyState.Root icon="sparkles">
            <EmptyState.Title>{t('releases.empty')}</EmptyState.Title>
          </EmptyState.Root>
        </Box>
      )}
    </PageFrame>
  );
}

function UpToDate({ version }: Readonly<{ version: string }>) {
  const t = useT();
  return (
    <Row gap={10} px={16} py={8} radius="pill" bg="surface1" border="border">
      <StatusDot online size={7} />
      <Text variant="meta" color="textMuted">
        {t('releases.upToDate')}
      </Text>
      <Text variant="meta">{version}</Text>
    </Row>
  );
}
