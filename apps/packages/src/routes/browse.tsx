import { SiteHeader } from '@kroma/site-kit/site-header';
import { createFileRoute } from '@tanstack/react-router';
import { InstallCard } from '#site/components/install-card';
import { ReleaseHeadline } from '#site/components/release-headline';
import { ReleaseList } from '#site/components/release-list';
import { SiteFooter } from '#site/components/site-footer';
import { getCatalog } from '#site/lib/get-catalog';
import { Box, Column, Row } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { PageMain } from '#ui/lib/landmark';

export const Route = createFileRoute('/browse')({
  loader: () => getCatalog(),
  component: Browse,
});

function Browse() {
  const { rows, repo, fetchedAt, source } = Route.useLoaderData();
  const latest = rows.find((r) => r.channel === 'stable');
  const nightly = rows.find((r) => r.channel === 'nightly');
  const current = [latest, nightly].filter((r) => r !== undefined);
  const freshness = fetchedAt
    ? `catalog refreshed ${fetchedAt.slice(0, 16)}`
    : 'the release list is unavailable right now';

  return (
    <Box bg="bg" minH="100%">
      <SiteHeader title="Synology package source" />
      <PageMain>
        <Box px={28} py={32}>
          <Column gap={32} w="100%" maxW={1080} mx="auto">
            <Column gap={10}>
              <Txt variant="h1">KROMA for Synology</Txt>
              <Txt color="textMuted">
                Self-hosted, direct-play HEVC media streaming for Synology DSM 7 (x86_64). One
                package, no dependencies.
              </Txt>
            </Column>

            <InstallCard url={source} />

            <Row gap={16} wrap align="stretch">
              {latest ? <ReleaseHeadline label="Latest stable" release={latest} /> : null}
              {nightly ? <ReleaseHeadline label="Nightly" release={nightly} /> : null}
            </Row>

            <ReleaseList releases={rows} current={current} />

            <Txt color="textDim" variant="meta">
              {`Served from github.com/${repo} · ${freshness}`}
            </Txt>
          </Column>
        </Box>
      </PageMain>
      <SiteFooter source={source} />
    </Box>
  );
}
