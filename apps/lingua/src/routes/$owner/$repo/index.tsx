import { Column } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { ListRow } from '@kromatv/ui/kit/molecules/list-row';
import { PageHeader } from '@kromatv/ui/kit/molecules/page-header';
import { Section } from '@kromatv/ui/kit/molecules/section';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { AddLanguageDialog } from '#site/components/add-language-dialog.component';
import { LanguageBadges, StageLegend } from '#site/components/language-badges.component';
import { LinguaPage } from '#site/components/lingua-page.component';
import { OutsideLink } from '#site/components/outside-link.component';
import { ProgressRow } from '#site/components/progress-row.component';
import { RouteLink } from '#site/components/route-link.component';
import { SyncError } from '#site/components/sync-error.component';
import { type SyncDrive, SyncStrip } from '#site/components/sync-strip.component';
import { Trail } from '#site/components/trail.component';
import { addLanguageCommand, syncCommand } from '#site/lib/command-actions';
import { workSummary } from '#site/lib/completion';
import { counted } from '#site/lib/counted';
import { repositoryUrl } from '#site/lib/github-links';
import { getProject } from '#site/lib/loaders';
import { titled } from '#site/lib/page-title';
import { projectId } from '#site/lib/project-id';
import { whileDriven } from '#site/lib/sync-facts';
import { useCommands } from '#site/lib/use-command-menu.hook';
import { usePollWhileReading } from '#site/lib/use-poll-while-reading.hook';
import { useSyncNow } from '#site/lib/use-sync-now.hook';
import type { LocaleSummary, ProjectSummary, ProjectView } from '#site/lib/views';

export const Route = createFileRoute('/$owner/$repo/')({
  loader: ({ params }) => getProject({ data: { id: projectId(params) } }),
  head: ({ params }) => titled(projectId(params)),
  component: ProjectPage,
});

function hintOf({ language, states, isSource }: LocaleSummary): string {
  const said = isSource
    ? 'The text every language translates'
    : (workSummary(states) ?? 'All translated');
  return `${language.nativeName} · ${language.tag} · ${said}`;
}

function LanguageRow({ locale }: Readonly<{ locale: LocaleSummary }>) {
  const { owner, repo } = Route.useParams();
  const facts = {
    title: locale.language.name,
    badges: <LanguageBadges locale={locale} />,
    hint: hintOf(locale),
    progress: locale.progress,
    stage: locale.stage,
  };
  return (
    <ProgressRow facts={facts}>
      {(parts) => (
        <RouteLink to="/$owner/$repo/$locale" params={{ owner, repo, locale: locale.language.tag }}>
          {parts}
        </RouteLink>
      )}
    </ProgressRow>
  );
}

function Languages({ view }: Readonly<{ view: ProjectView }>) {
  if (view.locales.length === 0) {
    return (
      <EmptyState.Root size="sm" icon="language-off">
        <EmptyState.Title>No language to translate</EmptyState.Title>
        <EmptyState.Hint>The project’s i18n.json lists no language yet.</EmptyState.Hint>
      </EmptyState.Root>
    );
  }
  const ordered = [
    ...view.locales.filter((l) => l.isSource),
    ...view.locales.filter((l) => !l.isSource),
  ];
  return (
    <ListRow.Group>
      {ordered.map((locale) => (
        <LanguageRow key={locale.language.tag} locale={locale} />
      ))}
    </ListRow.Group>
  );
}

function MissingProject() {
  return (
    <LinguaPage>
      <EmptyState.Root icon="folder-off">
        <EmptyState.Title>No such project</EmptyState.Title>
        <EmptyState.Hint>Lingua does not translate this repository.</EmptyState.Hint>
        <EmptyState.Actions>
          <Button icon="folders" label="See all projects" asChild>
            <RouteLink to="/" />
          </Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    </LinguaPage>
  );
}

function subtitleOf(project: ProjectSummary, languages: number): string {
  const source = project.source
    ? `Translated from ${project.source.name}`
    : 'No source language set';
  return `${source} · ${counted(languages, 'language')} · branch ${project.branch}`;
}

function Heading({ view, onAdd }: Readonly<{ view: ProjectView; onAdd: (() => void) | null }>) {
  const { project } = view;
  return (
    <Column gap={12}>
      <Trail project={project.id} />
      <PageHeader.Root>
        <PageHeader.Title>{project.id}</PageHeader.Title>
        <PageHeader.Subtitle>{subtitleOf(project, view.locales.length)}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <Button variant="ghost" size="sm" icon="brand-github" label="Repository" asChild>
            <OutsideLink to={repositoryUrl(project.id)} />
          </Button>
          {onAdd ? <Button size="sm" icon="plus" label="Add a language" onPress={onAdd} /> : null}
        </PageHeader.Actions>
      </PageHeader.Root>
    </Column>
  );
}

function useProjectSync(view: ProjectView) {
  const syncing = useSyncNow(view.project.id);
  const known = syncing.live?.sync ?? view.project.sync;
  const sync = syncing.running ? whileDriven(known) : known;
  usePollWhileReading(syncing.running ? [] : [sync]);
  return { sync, drive: view.viewer ? syncing : null };
}

function LanguagesSection({ view }: Readonly<{ view: ProjectView }>) {
  return (
    <Section.Root gap={16}>
      <Section.Header>
        <Section.Title>Languages</Section.Title>
      </Section.Header>
      <Languages view={view} />
      <StageLegend />
    </Section.Root>
  );
}

function useProjectCommands(view: ProjectView, drive: SyncDrive | null) {
  const [adding, setAdding] = useState(false);
  const canAdd = view.viewer !== null && view.project.error === null;
  const add = canAdd ? () => setAdding(true) : null;
  const sync = drive ? [syncCommand(view.project.id, drive.run)] : [];
  useCommands(add ? [addLanguageCommand(add), ...sync] : sync);
  return { adding, add, close: () => setAdding(false) };
}

function Dashboard({ view }: Readonly<{ view: ProjectView }>) {
  const { project } = view;
  const { sync, drive } = useProjectSync(view);
  const adding = useProjectCommands(view, drive);
  return (
    <LinguaPage>
      <Heading view={view} onAdd={adding.add} />
      <SyncStrip sync={sync} syncedAt={project.syncedAt} drive={drive} />
      {project.error ? <SyncError error={project.error} /> : null}
      <LanguagesSection view={view} />
      {adding.adding ? (
        <AddLanguageDialog
          project={project.id}
          taken={new Set(view.locales.map((locale) => locale.language.tag))}
          onClose={adding.close}
        />
      ) : null}
    </LinguaPage>
  );
}

function ProjectPage() {
  const view = Route.useLoaderData();
  return view ? <Dashboard view={view} /> : <MissingProject />;
}
