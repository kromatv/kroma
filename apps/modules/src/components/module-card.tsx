import type { ReactNode } from 'react';
import type { ModuleEntry } from '#site/catalog';
import { ModuleDownload, useDownloadPick } from '#site/components/module-download';
import { downloads } from '#site/lib/artifacts';
import { type Dependency, depEntries } from '#site/lib/deps';
import { shortHash } from '#site/lib/ui';
import { Badge } from '#ui/components/atoms/badge';
import { Box, Column, Row } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Divider } from '#ui/components/atoms/divider';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { CopyButton } from '#ui/components/molecules/copy-button';

const ICON = 60;
const ICON_RADIUS = 15;

function Requirement({ icon, children }: Readonly<{ icon: IconName; children: ReactNode }>) {
  return (
    <Row gap={6} px={10} py={4} radius="pill" bg="surface2" border="border" shrink={1} minW={0}>
      <Icon name={icon} size={13} color="textDim" />
      <Box shrink={1} minW={0}>
        <Text color="textMuted" variant="meta" lines={1}>
          {children}
        </Text>
      </Box>
    </Row>
  );
}

function Requirements({
  minServer,
  deps,
}: Readonly<{ minServer: string | null | undefined; deps: Dependency[] }>) {
  return (
    <Row gap={8} wrap align="center">
      <Text color="textDim" variant="overline">
        Requires
      </Text>
      {minServer ? <Requirement icon="server">KROMA {minServer}+</Requirement> : null}
      {deps.map((dep) => (
        <Requirement key={dep.id} icon="packages">
          {dep.range ? `${dep.id} ${dep.range}` : dep.id}
        </Requirement>
      ))}
    </Row>
  );
}

function Footer({ id, sha256 }: Readonly<{ id: string; sha256: string | null }>) {
  return (
    <Row gap={8} mt="auto">
      {sha256 ? (
        <>
          <Icon name="fingerprint" size={14} color="textDim" />
          <Box shrink={1} minW={0}>
            <Text color="textDim" variant="meta" font="mono" lines={1}>
              sha256 {shortHash(sha256)}
            </Text>
          </Box>
          <Box shrink={0}>
            <CopyButton value={sha256} label="Copy hash" iconOnly />
          </Box>
        </>
      ) : null}
      <Box shrink={0} ml="auto">
        <Button
          variant="ghost"
          size="sm"
          iconRight="chevron-right"
          label="Details"
          href={`/module/${id}`}
          role="link"
        />
      </Box>
    </Row>
  );
}

export function ModuleCard({ module: m }: Readonly<{ module: ModuleEntry }>) {
  const files = downloads(m);
  const { picked, pick } = useDownloadPick(files);
  const deps = depEntries(m.dependsOn);
  const requires = Boolean(m.minServer) || deps.length > 0;

  return (
    <Box
      bg="surface1"
      border="border"
      radius="xl"
      shadow="card"
      p={22}
      gap={16}
      grow={1}
      shrink={1}
      basis={360}
      maxW={520}
    >
      <Row gap={16} align="center" wrap>
        <Box bg="surface2" radius={ICON_RADIUS} w={ICON} h={ICON} shrink={0}>
          <Img src={m.icon ?? null} fill fit="cover" radius={ICON_RADIUS} />
        </Box>
        <Column gap={4} grow={1} shrink={1} basis={220} minW={0}>
          <Row gap={8} align="baseline">
            <Box shrink={1} minW={0}>
              <Text variant="title">{m.name}</Text>
            </Box>
            <Row gap={6} shrink={0}>
              <Badge tone="neutral">v{m.version}</Badge>
              {m.library ? <Badge tone="info">Library</Badge> : null}
              {(m.provides ?? []).map((c) => (
                <Badge key={`${c.kind}:${c.id}`} tone="success">
                  {c.kind}
                </Badge>
              ))}
            </Row>
          </Row>
          <Text color="textDim" variant="meta" font="mono" lines={1}>
            {m.id}
          </Text>
          {m.description ? (
            <Text color="textMuted" variant="meta" lines={2}>
              {m.description}
            </Text>
          ) : null}
        </Column>
        {picked ? <ModuleDownload files={files} picked={picked} onPick={pick} /> : null}
      </Row>

      <Divider />
      {requires ? <Requirements minServer={m.minServer} deps={deps} /> : null}
      <Footer id={m.id} sha256={picked?.sha256 ?? null} />
    </Box>
  );
}
