import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { ListRow } from '@kromatv/ui/kit/molecules/list-row';
import { PageHeader } from '@kromatv/ui/kit/molecules/page-header';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { FilterChips } from '#site/components/filter-chips.component';
import { LanguageBadges } from '#site/components/language-badges.component';
import { LinguaPage } from '#site/components/lingua-page.component';
import { ProgressMeter } from '#site/components/progress-meter.component';
import { ProgressRow } from '#site/components/progress-row.component';
import { RouteLink } from '#site/components/route-link.component';
import { SendBar } from '#site/components/send-bar.component';
import { SignInPrompt } from '#site/components/sign-in-prompt.component';
import { Trail } from '#site/components/trail.component';
import { SearchField } from '#site/components/search-field.component';
import { workSummary } from '#site/lib/completion';
import { counted } from '#site/lib/counted';
import { sectionFilters } from '#site/lib/filter-choices';
import { getLocale } from '#site/lib/loaders';
import {
  matchesNamespace,
  type NamespaceFilter,
  namespaceCounts,
  nextNamespace,
} from '#site/lib/namespace-filter';
import { titled } from '#site/lib/page-title';
import { projectId } from '#site/lib/project-id';
import { useLanguageWork } from '#site/lib/use-language-work.hook';
import type { LocaleView, NamespaceSummary, Stage } from '#site/lib/views';

export const Route = createFileRoute('/$owner/$repo/$locale/')({
  loader: ({ params }) => getLocale({ data: { id: projectId(params), locale: params.locale } }),
  head: ({ loaderData, params }) =>
    titled(loaderData?.locale.language.name ?? params.locale, projectId(params)),
  component: LocalePage,
});

function SectionRow({ namespace, stage }: Readonly<{ namespace: NamespaceSummary; stage: Stage }>) {
  const params = Route.useParams();
  const { file, drafts } = namespace;
  const badges =
    drafts > 0 ? (
      <Box>
        <Badge tone="info">{`${drafts} not sent`}</Badge>
      </Box>
    ) : null;
  const facts = {
    title: file,
    badges,
    hint: workSummary(namespace.states) ?? 'All translated',
    progress: namespace.progress,
    stage,
  };
  return (
    <ProgressRow facts={facts}>
      {(parts) => (
        <RouteLink to="/$owner/$repo/$locale/$" params={{ ...params, _splat: file }}>
          {parts}
        </RouteLink>
      )}
    </ProgressRow>
  );
}

function useSectionList(namespaces: readonly NamespaceSummary[]) {
  const [filter, setFilter] = useState<NamespaceFilter>('all');
  const [query, setQuery] = useState('');
  const wanted = query.trim().toLocaleLowerCase();
  const shown = namespaces.filter(
    (namespace) =>
      matchesNamespace(namespace, filter) && namespace.file.toLocaleLowerCase().includes(wanted),
  );
  const reset = () => {
    setFilter('all');
    setQuery('');
  };
  return { filter, setFilter, query, setQuery, shown, searched: wanted !== '', reset };
}

function SectionsHeading({
  count,
  list,
}: Readonly<{ count: number; list: ReturnType<typeof useSectionList> }>) {
  return (
    <Row gap={12} wrap align="center" between>
      <Text variant="h2">{counted(count, 'section')}</Text>
      <Box w={{ base: '100%', md: 280 }}>
        <SearchField
          label="Find a section"
          placeholder="Find a section"
          value={list.query}
          onValueChange={list.setQuery}
        />
      </Box>
    </Row>
  );
}

function NothingShown({ list }: Readonly<{ list: ReturnType<typeof useSectionList> }>) {
  return (
    <EmptyState.Root size="sm" icon={list.searched ? 'search' : 'circle-check'}>
      <EmptyState.Title>
        {list.searched ? 'No section matches' : 'Nothing to do here'}
      </EmptyState.Title>
      <EmptyState.Actions>
        <Button variant="ghost" size="sm" label="Show every section" onPress={list.reset} />
      </EmptyState.Actions>
    </EmptyState.Root>
  );
}

function SectionList({ view }: Readonly<{ view: LocaleView }>) {
  const list = useSectionList(view.namespaces);
  return (
    <Column gap={14}>
      <SectionsHeading count={view.namespaces.length} list={list} />
      <FilterChips
        label="Show sections"
        value={list.filter}
        onValueChange={list.setFilter}
        choices={sectionFilters(namespaceCounts(view.namespaces))}
      />
      {list.shown.length === 0 ? <NothingShown list={list} /> : null}
      <ListRow.Group>
        {list.shown.map((namespace) => (
          <SectionRow key={namespace.file} namespace={namespace} stage={view.locale.stage} />
        ))}
      </ListRow.Group>
    </Column>
  );
}

function MissingLocale() {
  const { owner, repo } = Route.useParams();
  return (
    <LinguaPage>
      <Trail project={`${owner}/${repo}`} />
      <EmptyState.Root icon="language-off">
        <EmptyState.Title>No such language</EmptyState.Title>
        <EmptyState.Hint>This project does not offer this language.</EmptyState.Hint>
        <EmptyState.Actions>
          <Button icon="language" label="See its languages" asChild>
            <RouteLink to="/$owner/$repo" params={{ owner, repo }} />
          </Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    </LinguaPage>
  );
}

function Continue({ view }: Readonly<{ view: LocaleView }>) {
  const params = Route.useParams();
  const next = nextNamespace(view.namespaces);
  if (!next || view.locale.isSource) {
    return null;
  }
  return (
    <Button size="sm" icon="player-play" label="Continue translating" asChild>
      <RouteLink to="/$owner/$repo/$locale/$" params={{ ...params, _splat: next.file }} />
    </Button>
  );
}

function Heading({ view }: Readonly<{ view: LocaleView }>) {
  const { language, states } = view.locale;
  return (
    <Column gap={12}>
      <Trail project={view.project.id} language={language} />
      <PageHeader.Root>
        <PageHeader.Title>{language.name}</PageHeader.Title>
        <PageHeader.Subtitle>{`${language.nativeName} · ${language.tag} · ${workSummary(states) ?? 'All translated'}`}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <Continue view={view} />
        </PageHeader.Actions>
      </PageHeader.Root>
      <Row gap={8} wrap align="center">
        <LanguageBadges locale={view.locale} />
      </Row>
    </Column>
  );
}

function Language({ view }: Readonly<{ view: LocaleView }>) {
  const { language, progress, stage } = view.locale;
  const { work, act } = useLanguageWork(view);
  return (
    <LinguaPage>
      <Heading view={view} />
      <Box p={16} radius="xl" bg="surface1" border="border">
        <ProgressMeter progress={progress} stage={stage} label={`${language.name} progress`} />
      </Box>
      {view.viewer ? null : <SignInPrompt />}
      <SectionList view={view} />
      {view.viewer ? <SendBar work={work} act={act} /> : null}
    </LinguaPage>
  );
}

function LocalePage() {
  const view = Route.useLoaderData();
  return view ? <Language view={view} /> : <MissingLocale />;
}
