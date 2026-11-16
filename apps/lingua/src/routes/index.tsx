import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { createFileRoute } from '@tanstack/react-router';
import { LinguaPage } from '#site/components/lingua-page.component';
import { RouteLink } from '#site/components/route-link.component';
import { ProjectCard } from '#site/components/project-card.component';
import { getHome } from '#site/lib/loaders';

export const Route = createFileRoute('/')({
  loader: () => getHome(),
  component: Home,
});

function NoProject() {
  return (
    <EmptyState.Root icon="language">
      <EmptyState.Title>No project yet</EmptyState.Title>
      <EmptyState.Hint>
        Lingua translates the public repositories its LINGUA_PROJECTS variable lists, each with a
        lingua.json at its root. None is listed yet, or none has been read yet.
      </EmptyState.Hint>
      <EmptyState.Actions>
        <Button icon="settings" label="Set up Lingua" asChild>
          <RouteLink to="/setup" />
        </Button>
      </EmptyState.Actions>
    </EmptyState.Root>
  );
}

function Home() {
  const { viewer, projects } = Route.useLoaderData();
  return (
    <LinguaPage viewer={viewer}>
      <Column gap={10}>
        <Text variant="h1">Translate in the browser</Text>
        <Text color="textMuted">
          Pick a project and a language, fix or add messages, and your edits reach the repository as
          one pull request.
        </Text>
      </Column>
      {projects.length === 0 ? (
        <NoProject />
      ) : (
        <Row gap={16} wrap align="stretch">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </Row>
      )}
    </LinguaPage>
  );
}
