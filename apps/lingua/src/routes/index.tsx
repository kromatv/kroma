import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { createFileRoute } from '@tanstack/react-router';
import { LinguaPage } from '#site/components/lingua-page.component';
import { ProjectCard } from '#site/components/project-card.component';
import { getHome } from '#site/lib/loaders';

export const Route = createFileRoute('/')({
  loader: () => getHome(),
  component: Home,
});

function NoProject({ installUrl }: Readonly<{ installUrl: string | null }>) {
  return (
    <EmptyState.Root icon="language">
      <EmptyState.Title>No project yet</EmptyState.Title>
      <EmptyState.Hint>
        {installUrl
          ? 'Install the GitHub App on a repository that has a lingua.json.'
          : 'No repository is connected to this Lingua yet.'}
      </EmptyState.Hint>
      {installUrl ? (
        <EmptyState.Actions>
          <Button
            icon="brand-github"
            label="Install the GitHub App"
            href={installUrl}
            role="link"
          />
        </EmptyState.Actions>
      ) : null}
    </EmptyState.Root>
  );
}

function Home() {
  const { viewer, projects, installUrl } = Route.useLoaderData();
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
        <NoProject installUrl={installUrl} />
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
