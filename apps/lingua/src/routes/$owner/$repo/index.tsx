import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { createFileRoute } from '@tanstack/react-router';
import { LinguaPage } from '#site/components/lingua-page.component';
import { ProgressList } from '#site/components/progress-list.component';
import { ProgressRow } from '#site/components/progress-row.component';
import { RouteLink } from '#site/components/route-link.component';
import { SyncError } from '#site/components/sync-error.component';
import { getProject } from '#site/lib/loaders';
import { projectId } from '#site/lib/project-id';
import type { ProjectView } from '#site/lib/views';

export const Route = createFileRoute('/$owner/$repo/')({
  loader: ({ params }) => getProject({ data: { id: projectId(params) } }),
  component: ProjectPage,
});

function OpenLocale({ locale }: Readonly<{ locale: string }>) {
  const { owner, repo } = Route.useParams();
  return (
    <Button variant="ghost" size="sm" iconRight="chevron-right" label="Open" asChild>
      <RouteLink to="/$owner/$repo/$locale" params={{ owner, repo, locale }} />
    </Button>
  );
}

function Languages({ view }: Readonly<{ view: ProjectView }>) {
  if (view.locales.length === 0) {
    return (
      <EmptyState.Root size="sm" icon="language-off">
        <EmptyState.Title>No language to translate</EmptyState.Title>
        <EmptyState.Hint>The project's lingua.json lists no language yet.</EmptyState.Hint>
      </EmptyState.Root>
    );
  }
  return (
    <ProgressList>
      {view.locales.map(({ language, progress, isSource }) => (
        <ProgressRow
          key={language.tag}
          title={language.name}
          detail={`${language.nativeName} · ${language.tag}`}
          badges={isSource ? <Badge tone="info">Source</Badge> : null}
          progress={progress}
          action={<OpenLocale locale={language.tag} />}
        />
      ))}
    </ProgressList>
  );
}

function AllProjects() {
  return (
    <Row>
      <Button variant="ghost" size="sm" icon="chevron-left" label="All projects" asChild>
        <RouteLink to="/" />
      </Button>
    </Row>
  );
}

function MissingProject() {
  return (
    <LinguaPage viewer={null}>
      <AllProjects />
      <EmptyState.Root icon="folder-off">
        <EmptyState.Title>No such project</EmptyState.Title>
        <EmptyState.Hint>Lingua does not translate this repository.</EmptyState.Hint>
      </EmptyState.Root>
    </LinguaPage>
  );
}

function ProjectHeading({ view }: Readonly<{ view: ProjectView }>) {
  return (
    <Row gap={16} wrap between align="flex-end">
      <Column gap={6} shrink={1} minW={0}>
        <Text variant="h1">{view.project.id}</Text>
        <Text color="textMuted">
          {view.project.source
            ? `Translated from ${view.project.source.name}`
            : 'No source language set'}
        </Text>
      </Column>
      <Button
        variant="ghost"
        size="sm"
        icon="brand-github"
        label="Repository"
        href={view.repoUrl}
        role="link"
      />
    </Row>
  );
}

function ProjectPage() {
  const view = Route.useLoaderData();
  if (!view) {
    return <MissingProject />;
  }
  return (
    <LinguaPage viewer={view.viewer}>
      <AllProjects />
      <ProjectHeading view={view} />
      {view.project.error ? <SyncError error={view.project.error} /> : null}
      <Languages view={view} />
    </LinguaPage>
  );
}
