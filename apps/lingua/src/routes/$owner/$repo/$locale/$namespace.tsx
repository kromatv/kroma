import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { SegmentGroup } from '@kromatv/ui/kit/molecules/segment-group';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { LinguaPage } from '#site/components/lingua-page.component';
import { MessageRow } from '#site/components/message-row.component';
import { RouteLink } from '#site/components/route-link.component';
import { SendBar } from '#site/components/send-bar.component';
import { SignInPrompt } from '#site/components/sign-in-prompt.component';
import { counted } from '#site/lib/counted';
import { getNamespace } from '#site/lib/loaders';
import { projectId } from '#site/lib/project-id';
import { isUntranslated, matchesRowFilter, type RowFilter } from '#site/lib/row-filter';
import type { NamespaceView, RowView } from '#site/lib/views';

export const Route = createFileRoute('/$owner/$repo/$locale/$namespace')({
  loader: ({ params }) =>
    getNamespace({
      data: { id: projectId(params), locale: params.locale, namespace: params.namespace },
    }),
  component: NamespacePage,
});

const NOTHING_SHOWN: Record<Exclude<RowFilter, 'all'>, string> = {
  missing: 'Nothing left to translate here',
  mine: 'You have not edited a message here yet',
};

function useRowFilter(rows: readonly RowView[]) {
  const [filter, setFilter] = useState<RowFilter>('all');
  const [listed, setListed] = useState<ReadonlySet<string> | null>(null);
  const choose = (next: RowFilter) => {
    setFilter(next);
    setListed(
      next === 'all'
        ? null
        : new Set(rows.filter((row) => matchesRowFilter(row, next)).map((row) => row.key)),
    );
  };
  const shown = listed ? rows.filter((row) => listed.has(row.key)) : rows;
  return { filter, choose, shown };
}

function MessagesBar({
  rows,
  filter,
  onFilterChange,
}: Readonly<{
  rows: readonly RowView[];
  filter: RowFilter;
  onFilterChange: (next: RowFilter) => void;
}>) {
  const missing = rows.filter(isUntranslated).length;
  return (
    <Row gap={12} wrap between align="center">
      <Text variant="meta" color="textDim">
        {`${counted(rows.length, 'message')} · ${missing} untranslated`}
      </Text>
      <SegmentGroup.Root label="Show" size="sm" value={filter} onValueChange={onFilterChange}>
        <SegmentGroup.Item value="all">
          <SegmentGroup.Label>All</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="missing">
          <SegmentGroup.Label>Missing</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="mine">
          <SegmentGroup.Label>My edits</SegmentGroup.Label>
        </SegmentGroup.Item>
      </SegmentGroup.Root>
    </Row>
  );
}

function Messages({ view }: Readonly<{ view: NamespaceView }>) {
  const { filter, choose, shown } = useRowFilter(view.rows);
  const target = {
    project: view.project.id,
    locale: view.locale.language.tag,
    namespace: view.namespace,
  };
  return (
    <Column gap={16}>
      <MessagesBar rows={view.rows} filter={filter} onFilterChange={choose} />
      {filter !== 'all' && shown.length === 0 ? (
        <EmptyState.Root size="sm" icon="circle-check">
          <EmptyState.Title>{NOTHING_SHOWN[filter]}</EmptyState.Title>
        </EmptyState.Root>
      ) : null}
      {shown.map((row) => (
        <MessageRow
          key={row.key}
          row={row}
          target={target}
          sourceName={view.project.source?.name ?? 'Source'}
          editable={view.viewer !== null}
        />
      ))}
    </Column>
  );
}

function BackToLocale({ name }: Readonly<{ name?: string }>) {
  const { owner, repo, locale } = Route.useParams();
  return (
    <Row>
      <Button variant="ghost" size="sm" icon="chevron-left" label={name ?? locale} asChild>
        <RouteLink to="/$owner/$repo/$locale" params={{ owner, repo, locale }} />
      </Button>
    </Row>
  );
}

function MissingNamespace({ namespace }: Readonly<{ namespace: string }>) {
  return (
    <LinguaPage viewer={null}>
      <BackToLocale />
      <EmptyState.Root icon="file-off">
        <EmptyState.Title>No such namespace</EmptyState.Title>
        <EmptyState.Hint>{`The source has no ${namespace} namespace.`}</EmptyState.Hint>
      </EmptyState.Root>
    </LinguaPage>
  );
}

function NamespaceHeading({ view }: Readonly<{ view: NamespaceView }>) {
  const { language } = view.locale;
  return (
    <Column gap={6}>
      <Text variant="h1">{view.namespace}</Text>
      <Text color="textMuted">{`${view.project.id} · ${language.name} (${language.nativeName})`}</Text>
    </Column>
  );
}

function NamespacePage() {
  const view = Route.useLoaderData();
  const { locale, namespace } = Route.useParams();
  if (!view) {
    return <MissingNamespace namespace={namespace} />;
  }
  return (
    <LinguaPage viewer={view.viewer}>
      <BackToLocale name={view.locale.language.name} />
      <NamespaceHeading view={view} />
      {view.viewer ? null : <SignInPrompt />}
      <Messages key={`${locale}/${namespace}`} view={view} />
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
