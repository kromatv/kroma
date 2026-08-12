import { PageMain } from '@kroma/ui/kit';
import { Box, Column, Row } from '@kroma/ui/kit/atoms/box';
import { Text } from '@kroma/ui/kit/atoms/text';
import { EmptyState } from '@kroma/ui/kit/molecules/empty-state';
import { Pagination } from '@kroma/ui/kit/molecules/pagination';
import { createFileRoute } from '@tanstack/react-router';
import { ModuleCard } from '#site/components/module-card';
import { ModuleSearch } from '#site/components/module-search';
import { RegistryUrl } from '#site/components/registry-url';
import { SiteFooter } from '#site/components/site-footer';
import { SiteHeader } from '#site/components/site-header';
import { sliceLabel, useModuleBrowse } from '#site/lib/browse';
import { getCatalog } from '#site/lib/get-catalog';

export const Route = createFileRoute('/')({
  loader: () => getCatalog(),
  component: Registry,
});

function Registry() {
  const { modules, generatedAt, registry } = Route.useLoaderData();
  const browse = useModuleBrowse(modules);
  const count = modules.length === 1 ? '1 module' : `${modules.length} modules`;
  const updated = generatedAt ? ` · updated ${generatedAt.slice(0, 10)}` : '';

  return (
    <Box bg="bg" minH="100%">
      <SiteHeader title="Module registry" />
      <PageMain>
        <Box px={28} py={32}>
          <Column gap={32} w="100%" maxW={1080} mx="auto">
            <Column gap={10}>
              <Text variant="h1">KROMA Modules</Text>
              <Text color="textMuted">
                Downloads, indexers, VPN, transcription: installed straight from your server's
                admin.
              </Text>
            </Column>

            <RegistryUrl
              url={registry}
              note={`Admin → Modules → Registries. ${count} available${updated}`}
            />

            <Column gap={20}>
              <Row gap={16} wrap between align="flex-end">
                <Column gap={4}>
                  <Text variant="overline" color="accentText">
                    Modules
                  </Text>
                  {browse.total > 0 ? (
                    <Text color="textDim" variant="meta">
                      {sliceLabel(browse)}
                    </Text>
                  ) : null}
                </Column>
                <ModuleSearch value={browse.query} onChange={browse.search} />
              </Row>

              {browse.items.length === 0 ? (
                <EmptyState.Root size="sm" icon="search">
                  <EmptyState.Title>No module matches</EmptyState.Title>
                  <EmptyState.Hint>Search by name, reverse-DNS id or description.</EmptyState.Hint>
                </EmptyState.Root>
              ) : (
                <Row gap={16} wrap align="stretch">
                  {browse.items.map((m) => (
                    <ModuleCard key={m.id} module={m} />
                  ))}
                </Row>
              )}

              {browse.pageCount > 1 ? (
                <Row justify="flex-end">
                  <Pagination.Root
                    label="Modules"
                    size="sm"
                    page={browse.page}
                    pageCount={browse.pageCount}
                    onPageChange={browse.goTo}
                  />
                </Row>
              ) : null}
            </Column>
          </Column>
        </Box>
      </PageMain>
      <SiteFooter registry={registry} />
    </Box>
  );
}
