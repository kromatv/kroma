import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { SegmentGroup } from '@kromatv/ui/kit/molecules/segment-group';
import { createFileRoute } from '@tanstack/react-router';
import { useState, useSyncExternalStore } from 'react';
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

export const Route = createFileRoute('/$owner/$repo/$locale/$')({
  loader: ({ params }) => {
    const { _splat } = params;
    return getNamespace({
      data: { id: projectId(params), locale: params.locale, file: _splat ?? '' },
    });
  },
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

function onHashChange(change: () => void): () => void {
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
}

function keyOf(hash: string): string | null {
  try {
    return hash.length > 1 ? decodeURIComponent(hash.slice(1)) : null;
  } catch {
    return null;
  }
}

function useLinkedKey(): string | null {
  const hash = useSyncExternalStore(
    onHashChange,
    () => window.location.hash,
    () => '',
  );
  return keyOf(hash);
}

function Messages({ view }: Readonly<{ view: NamespaceView }>) {
  const { filter, choose, shown } = useRowFilter(view.rows);
  const linked = useLinkedKey();
  const target = {
    project: view.project.id,
    locale: view.locale.language.tag,
    file: view.file,
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
          key={row.key === linked ? `${row.key}#linked` : row.key}
          row={row}
          linked={row.key === linked}
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

function MissingFile({ file }: Readonly<{ file: string }>) {
  return (
    <LinguaPage viewer={null}>
      <BackToLocale />
      <EmptyState.Root icon="file-off">
        <EmptyState.Title>No such file</EmptyState.Title>
        <EmptyState.Hint>{`The source has no ${file} file.`}</EmptyState.Hint>
      </EmptyState.Root>
    </LinguaPage>
  );
}

function NamespaceHeading({ view }: Readonly<{ view: NamespaceView }>) {
  const { language } = view.locale;
  return (
    <Column gap={6}>
      <Text variant="h1">{view.file}</Text>
      <Text color="textMuted">{`${view.project.id} · ${language.name} (${language.nativeName})`}</Text>
    </Column>
  );
}

function NamespacePage() {
  const view = Route.useLoaderData();
  const { locale, _splat: file = '' } = Route.useParams();
  if (!view) {
    return <MissingFile file={file} />;
  }
  return (
    <LinguaPage viewer={view.viewer}>
      <BackToLocale name={view.locale.language.name} />
      <NamespaceHeading view={view} />
      {view.viewer ? null : <SignInPrompt />}
      <Messages key={`${locale}/${file}`} view={view} />
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
