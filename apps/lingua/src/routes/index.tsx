import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { IconWell } from '@kromatv/ui/kit/atoms/icon-well';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { PageHeader } from '@kromatv/ui/kit/molecules/page-header';
import { createFileRoute, useLocation } from '@tanstack/react-router';
import { LinguaPage } from '#site/components/lingua-page.component';
import { ProjectCard } from '#site/components/project-card.component';
import { RouteLink } from '#site/components/route-link.component';
import { signInUrl } from '#site/lib/api-client';
import { getHome } from '#site/lib/loaders';
import { usePollWhileReading } from '#site/lib/use-poll-while-reading.hook';
import { useSite } from '#site/lib/use-site.hook';
import type { ProjectSummary, Viewer } from '#site/lib/views';

export const Route = createFileRoute('/')({
  loader: () => getHome(),
  component: Home,
});

const STEPS = [
  {
    icon: 'language',
    title: 'Pick a language',
    hint: 'Open a project and the language you speak.',
  },
  { icon: 'pencil', title: 'Translate', hint: 'Fix or add messages; each one saves as you go.' },
  {
    icon: 'git-pull-request',
    title: 'Send',
    hint: 'Your changes reach the repository as your pull request.',
  },
] as const;

function HowItWorks() {
  return (
    <Row gap={12} wrap align="stretch">
      {STEPS.map((step, at) => (
        <Row
          key={step.title}
          gap={12}
          align="flex-start"
          grow={1}
          shrink={1}
          basis={240}
          p={16}
          radius="xl"
          border="border"
        >
          <IconWell name={step.icon} size="sm" tone="accent" />
          <Column gap={2} shrink={1} minW={0}>
            <Text variant="label">{`${at + 1}. ${step.title}`}</Text>
            <Text variant="meta" color="textMuted">
              {step.hint}
            </Text>
          </Column>
        </Row>
      ))}
    </Row>
  );
}

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

function PrimaryAction({ viewer }: Readonly<{ viewer: Viewer | null }>) {
  const here = useLocation({ select: (location) => location.href });
  const signIn = useSite()?.signIn ?? false;
  if (viewer) {
    return null;
  }
  return signIn ? (
    <Button
      size="sm"
      icon="brand-github"
      label="Sign in to translate"
      href={signInUrl(here)}
      role="link"
    />
  ) : null;
}

function Projects({ projects }: Readonly<{ projects: readonly ProjectSummary[] }>) {
  if (projects.length === 0) {
    return <NoProject />;
  }
  return (
    <Box gap={16} row={{ base: false, md: true }} wrap align="stretch">
      {projects.map((project) => (
        <Box key={project.id} grow={1} shrink={1} basis={{ base: 'auto', md: 360 }}>
          <ProjectCard project={project} />
        </Box>
      ))}
    </Box>
  );
}

function Home() {
  const { viewer, projects } = Route.useLoaderData();
  usePollWhileReading(projects.map((project) => project.sync));
  return (
    <LinguaPage>
      <PageHeader.Root>
        <PageHeader.Title>Projects</PageHeader.Title>
        <PageHeader.Subtitle>
          Pick a project and a language, fix or add messages, and send them as one pull request.
        </PageHeader.Subtitle>
        <PageHeader.Actions>
          <PrimaryAction viewer={viewer} />
        </PageHeader.Actions>
      </PageHeader.Root>
      <Projects projects={projects} />
      <Column gap={12}>
        <Text variant="overline" color="textDim">
          How it works
        </Text>
        <HowItWorks />
      </Column>
    </LinguaPage>
  );
}
