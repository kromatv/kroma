import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { SegmentGroup } from '@kromatv/ui/kit/molecules/segment-group';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { LinguaPage } from '#site/components/lingua-page.component';
import { ProgressList } from '#site/components/progress-list.component';
import { ProgressMeter } from '#site/components/progress-meter.component';
import { ProgressRow } from '#site/components/progress-row.component';
import { RouteLink } from '#site/components/route-link.component';
import { SendBar } from '#site/components/send-bar.component';
import { SignInPrompt } from '#site/components/sign-in-prompt.component';
import { completion } from '#site/lib/completion';
import { counted } from '#site/lib/counted';
import { getLocale } from '#site/lib/loaders';
import { projectId } from '#site/lib/project-id';
import type { LocaleSummary, LocaleView, NamespaceSummary } from '#site/lib/views';

type NamespaceFilter = 'all' | 'incomplete';

export const Route = createFileRoute('/$owner/$repo/$locale/')({
  loader: ({ params }) => getLocale({ data: { id: projectId(params), locale: params.locale } }),
  component: LocalePage,
});

function NamespaceFilterChoice({
  filter,
  onFilterChange,
}: Readonly<{ filter: NamespaceFilter; onFilterChange: (next: NamespaceFilter) => void }>) {
  return (
    <SegmentGroup.Root label="Namespaces" size="sm" value={filter} onValueChange={onFilterChange}>
      <SegmentGroup.Item value="all">
        <SegmentGroup.Label>All</SegmentGroup.Label>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="incomplete">
        <SegmentGroup.Label>Incomplete</SegmentGroup.Label>
      </SegmentGroup.Item>
    </SegmentGroup.Root>
  );
}

function TranslateNamespace({ namespace }: Readonly<{ namespace: string }>) {
  const params = Route.useParams();
  return (
    <Button variant="ghost" size="sm" iconRight="chevron-right" label="Translate" asChild>
      <RouteLink to="/$owner/$repo/$locale/$namespace" params={{ ...params, namespace }} />
    </Button>
  );
}

function NamespaceList({ namespaces }: Readonly<{ namespaces: readonly NamespaceSummary[] }>) {
  return (
    <ProgressList>
      {namespaces.map(({ namespace, progress, drafts }) => (
        <ProgressRow
          key={namespace}
          title={namespace}
          badges={
            drafts > 0 ? <Badge tone="info">{`${counted(drafts, 'edit')} not sent`}</Badge> : null
          }
          progress={progress}
          action={<TranslateNamespace namespace={namespace} />}
        />
      ))}
    </ProgressList>
  );
}

function Namespaces({ view }: Readonly<{ view: LocaleView }>) {
  const [filter, setFilter] = useState<NamespaceFilter>('all');
  const shown = view.namespaces.filter(
    ({ progress }) => filter === 'all' || !completion(progress).complete,
  );
  return (
    <Column gap={16}>
      <Row gap={12} wrap between align="center">
        <Text variant="overline" color="accentText">
          {counted(view.namespaces.length, 'namespace')}
        </Text>
        <NamespaceFilterChoice filter={filter} onFilterChange={setFilter} />
      </Row>
      {shown.length === 0 ? (
        <EmptyState.Root size="sm" icon="circle-check">
          <EmptyState.Title>Every namespace is complete</EmptyState.Title>
          <EmptyState.Hint>Show all of them to review what is already translated.</EmptyState.Hint>
        </EmptyState.Root>
      ) : (
        <NamespaceList namespaces={shown} />
      )}
    </Column>
  );
}

function BackToProject() {
  const { owner, repo } = Route.useParams();
  return (
    <Row>
      <Button variant="ghost" size="sm" icon="chevron-left" label={`${owner}/${repo}`} asChild>
        <RouteLink to="/$owner/$repo" params={{ owner, repo }} />
      </Button>
    </Row>
  );
}

function MissingLocale() {
  return (
    <LinguaPage viewer={null}>
      <BackToProject />
      <EmptyState.Root icon="language-off">
        <EmptyState.Title>No such language</EmptyState.Title>
        <EmptyState.Hint>This project does not offer this language.</EmptyState.Hint>
      </EmptyState.Root>
    </LinguaPage>
  );
}

function LocaleHeading({ locale }: Readonly<{ locale: LocaleSummary }>) {
  const { language, progress, isSource } = locale;
  return (
    <Row gap={20} wrap between align="flex-end">
      <Column gap={6} grow={1} shrink={1} basis={280} minW={0}>
        <Row gap={10} align="center" wrap>
          <Text variant="h1">{language.name}</Text>
          {isSource ? <Badge tone="info">Source</Badge> : null}
        </Row>
        <Text color="textMuted">{`${language.nativeName} · ${language.tag}`}</Text>
      </Column>
      <Box grow={1} shrink={1} basis={220} maxW={360}>
        <ProgressMeter progress={progress} label={`${language.name} progress`} />
      </Box>
    </Row>
  );
}

function LocalePage() {
  const view = Route.useLoaderData();
  if (!view) {
    return <MissingLocale />;
  }
  return (
    <LinguaPage viewer={view.viewer}>
      <BackToProject />
      <LocaleHeading locale={view.locale} />
      {view.viewer ? null : <SignInPrompt />}
      <Namespaces view={view} />
      {view.viewer ? (
        <SendBar
          project={view.project.id}
          locale={view.locale.language.tag}
          drafts={view.drafts}
          proposed={view.proposed}
          proposal={view.proposal}
        />
      ) : null}
    </LinguaPage>
  );
}
