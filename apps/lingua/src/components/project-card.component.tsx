import { type StyleDecl, svFor } from '@kromatv/ui/kit';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Focusable } from '@kromatv/ui/kit/atoms/focusable';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { RouteLink } from '#site/components/route-link.component';
import { SyncBadge, SyncProgress } from '#site/components/sync-status.component';
import { ago } from '#site/lib/ago';
import { counted } from '#site/lib/counted';
import { projectParams } from '#site/lib/project-id';
import { syncFacts } from '#site/lib/sync-facts';
import type { ProjectSummary } from '#site/lib/views';

const card = svFor<{ root: StyleDecl; glyph: { color: string } }>()({
  slots: {
    root: {
      gap: 12,
      p: 20,
      radius: 'xl',
      bg: 'surface1',
      border: 'border',
      _hover: { border: 'borderStrong', bg: 'surface2' },
    },
    glyph: { color: 'textDim', _hover: { color: 'text' } },
  },
});

function factsOf(project: ProjectSummary): string {
  const source = project.source ? `From ${project.source.name}` : 'No source language';
  return `${source} · ${counted(project.locales, 'language')} · ${project.branch}`;
}

function Problem({ project }: Readonly<{ project: ProjectSummary }>) {
  const facts = syncFacts(project.sync);
  const problem = project.error ?? (project.sync.kind === 'failed' ? facts.detail : null);
  if (!problem) {
    return null;
  }
  return (
    <Row gap={8} align="flex-start">
      <Icon name="alert-triangle" size={15} color="danger" />
      <Box shrink={1} minW={0}>
        <Text variant="meta" color="danger" lines={3}>
          {problem}
        </Text>
      </Box>
    </Row>
  );
}

function Heading({ project, glyph }: Readonly<{ project: ProjectSummary; glyph: string }>) {
  return (
    <Row gap={10} align="center" between>
      <Row gap={10} align="center" shrink={1} minW={0}>
        <Icon name="brand-github" size={20} color={glyph} />
        <Box shrink={1} minW={0}>
          <Text variant="title" lines={1}>
            {project.id}
          </Text>
        </Box>
      </Row>
      <Row gap={8} align="center" shrink={0}>
        <SyncBadge sync={project.sync} />
        <Icon name="chevron-right" size={18} color={glyph} />
      </Row>
    </Row>
  );
}

/** One project on the home page, the whole card its link: what it translates, where its sync stands, and why it failed. */
export function ProjectCard({ project }: Readonly<{ project: ProjectSummary }>) {
  return (
    <Focusable sv={card} label={`Open ${project.id}`} asChild>
      {({ slots }) => (
        <RouteLink to="/$owner/$repo" params={projectParams(project.id)}>
          <Heading project={project} glyph={slots.glyph.color} />
          <Box gap={4}>
            <Text color="textMuted">{factsOf(project)}</Text>
            <Text variant="meta" color="textDim">
              {project.syncedAt === null ? 'Not read yet' : `Synced ${ago(project.syncedAt)}`}
            </Text>
          </Box>
          <SyncProgress sync={project.sync} />
          <Problem project={project} />
        </RouteLink>
      )}
    </Focusable>
  );
}
