import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { RouteLink } from '#site/components/route-link.component';
import { SyncError } from '#site/components/sync-error.component';
import { counted } from '#site/lib/counted';
import { projectParams } from '#site/lib/project-id';
import type { ProjectSummary } from '#site/lib/views';

function synced(syncedAt: number | null): string {
  return syncedAt === null
    ? 'Not synced yet'
    : `Synced ${new Date(syncedAt * 1000).toISOString().slice(0, 10)}`;
}

function Heading({ id }: Readonly<{ id: string }>) {
  return (
    <Row gap={10} align="center" minW={0}>
      <Icon name="brand-github" size={18} color="textDim" />
      <Box shrink={1} minW={0}>
        <Text variant="title" lines={1}>
          {id}
        </Text>
      </Box>
    </Row>
  );
}

function Facts({ project }: Readonly<{ project: ProjectSummary }>) {
  const source = project.source ? `From ${project.source.name}` : 'No source language';
  return (
    <Column gap={4}>
      <Text color="textMuted">{`${source} · ${counted(project.locales, 'language')}`}</Text>
      <Text variant="meta" color="textDim">
        {synced(project.syncedAt)}
      </Text>
    </Column>
  );
}

/** One project on the home page: what it translates from, into how many languages, and why its sync failed. */
export function ProjectCard({ project }: Readonly<{ project: ProjectSummary }>) {
  return (
    <Box
      bg="surface1"
      border="border"
      radius="xl"
      shadow="card"
      p={20}
      gap={14}
      grow={1}
      shrink={1}
      basis={320}
      maxW={520}
    >
      <Heading id={project.id} />
      <Facts project={project} />
      {project.error ? <SyncError error={project.error} /> : null}
      <Row justify="flex-end" mt="auto">
        <Button variant="ghost" size="sm" iconRight="chevron-right" label="Open" asChild>
          <RouteLink to="/$owner/$repo" params={projectParams(project.id)} />
        </Button>
      </Row>
    </Box>
  );
}
