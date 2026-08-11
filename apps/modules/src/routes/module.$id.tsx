import { PageMain } from '@kroma/ui/kit';
import { Badge } from '@kroma/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kroma/ui/kit/atoms/box';
import { Button } from '@kroma/ui/kit/atoms/button';
import { Icon } from '@kroma/ui/kit/atoms/icon';
import { Img } from '@kroma/ui/kit/atoms/img';
import { Text } from '@kroma/ui/kit/atoms/text';
import { CopyButton } from '@kroma/ui/kit/molecules/copy-button';
import { EmptyState } from '@kroma/ui/kit/molecules/empty-state';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { ModuleEntry } from '#site/catalog';
import { ModuleBuilds } from '#site/components/module-builds';
import { ModuleDownload, useDownloadPick } from '#site/components/module-download';
import { ModuleHistory } from '#site/components/module-history';
import { RegistryUrl } from '#site/components/registry-url';
import { SiteFooter } from '#site/components/site-footer';
import { SiteHeader } from '#site/components/site-header';
import { downloads } from '#site/lib/artifacts';
import { depEntries } from '#site/lib/deps';
import { getCatalog } from '#site/lib/get-catalog';
import { getModuleHistory } from '#site/lib/get-module';

export const Route = createFileRoute('/module/$id')({
  loader: async ({ params }) => {
    const [catalog, history] = await Promise.all([
      getCatalog(),
      getModuleHistory({ data: { id: params.id } }),
    ]);
    return {
      module: catalog.modules.find((m) => m.id === params.id) ?? null,
      registry: catalog.registry,
      history,
      id: params.id,
    };
  },
  component: ModulePage,
});

const ICON = 96;
const ICON_RADIUS = 24;

function Page({ children, registry }: Readonly<{ children: ReactNode; registry: string }>) {
  return (
    <Box bg="bg" minH="100%">
      <SiteHeader title="Module registry" />
      <PageMain>
        <Box px={28} py={32}>
          <Column gap={28} w="100%" maxW={1080} mx="auto">
            <Row>
              <Button variant="ghost" size="sm" icon="chevron-left" label="All modules" href="/" />
            </Row>
            {children}
          </Column>
        </Box>
      </PageMain>
      <SiteFooter registry={registry} />
    </Box>
  );
}

function Hero({ module: m }: Readonly<{ module: ModuleEntry }>) {
  const files = downloads(m);
  const { picked, pick } = useDownloadPick(files);
  const deps = depEntries(m.dependsOn);
  return (
    <Row gap={24} align="flex-start" wrap>
      <Box bg="surface2" radius={ICON_RADIUS} w={ICON} h={ICON} shrink={0}>
        <Img src={m.icon ?? null} fill fit="cover" radius={ICON_RADIUS} />
      </Box>
      <Column gap={10} grow={1} shrink={1} basis={320} minW={0}>
        <Row gap={10} align="baseline" wrap>
          <Text variant="h1">{m.name}</Text>
          <Badge tone="neutral">v{m.version}</Badge>
          {m.library ? <Badge tone="info">Library</Badge> : null}
        </Row>
        <Row gap={8}>
          <Box shrink={1} minW={0}>
            <Text color="textDim" font="mono" lines={1}>
              {m.id}
            </Text>
          </Box>
          <Box shrink={0}>
            <CopyButton value={m.id} label="Copy id" iconOnly />
          </Box>
        </Row>
        {m.description ? <Text color="textMuted">{m.description}</Text> : null}
        {m.minServer || deps.length > 0 ? (
          <Row gap={12} wrap align="center">
            {m.minServer ? (
              <Row gap={6}>
                <Icon name="server" size={14} color="textDim" />
                <Text color="textDim" variant="meta">
                  KROMA {m.minServer}+
                </Text>
              </Row>
            ) : null}
            {deps.map((dep) => (
              <Row gap={6} key={dep.id}>
                <Icon name="packages" size={14} color="textDim" />
                <Text color="textDim" variant="meta">
                  {dep.range ? `${dep.id} ${dep.range}` : dep.id}
                </Text>
              </Row>
            ))}
          </Row>
        ) : null}
      </Column>
      {picked ? <ModuleDownload files={files} picked={picked} onPick={pick} /> : null}
    </Row>
  );
}

function ModulePage() {
  const { module, registry, history, id } = Route.useLoaderData();

  if (!module) {
    return (
      <Page registry={registry}>
        <EmptyState.Root
          icon="package-off"
          title="No such module"
          hint={`The registry does not list ${id}.`}
        />
      </Page>
    );
  }

  return (
    <Page registry={registry}>
      <Hero module={module} />
      <ModuleBuilds files={downloads(module)} />
      <ModuleHistory rows={history} />
      <RegistryUrl url={registry} note="Admin → Modules → Registries, then install from there." />
    </Page>
  );
}
