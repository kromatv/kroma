import { Column } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { PageHeader } from '@kromatv/ui/kit/molecules/page-header';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { EditorToolbar } from '#site/components/editor-toolbar.component';
import { LinguaPage } from '#site/components/lingua-page.component';
import { type CardContext, MessageCard, Notes } from '#site/components/message-card.component';
import { RouteLink } from '#site/components/route-link.component';
import { SendBar } from '#site/components/send-bar.component';
import { SignInPrompt } from '#site/components/sign-in-prompt.component';
import { Trail } from '#site/components/trail.component';
import { completion } from '#site/lib/completion';
import { counted } from '#site/lib/counted';
import { getNamespace } from '#site/lib/loaders';
import { projectId } from '#site/lib/project-id';
import { groupRows, isUntranslated, type MessageGroup, sharedNotes } from '#site/lib/row-filter';
import { useConfirmMessage } from '#site/lib/use-confirm-message.hook';
import { EditorFields, type FieldActions, useEditorKeys } from '#site/lib/use-editor-keys.hook';
import { useLanguageCommands } from '#site/lib/use-language-commands.hook';
import { useLinkedKey } from '#site/lib/use-linked-key.hook';
import { useMessageList } from '#site/lib/use-message-list.hook';
import { useSending } from '#site/lib/use-sending.hook';
import type { NamespaceView } from '#site/lib/views';

export const Route = createFileRoute('/$owner/$repo/$locale/$')({
  loader: ({ params }) => {
    const { _splat } = params;
    return getNamespace({
      data: { id: projectId(params), locale: params.locale, file: _splat ?? '' },
    });
  },
  component: NamespacePage,
});

function NothingShown({ searched, onReset }: Readonly<{ searched: boolean; onReset: () => void }>) {
  return (
    <EmptyState.Root size="sm" icon={searched ? 'search' : 'circle-check'}>
      <EmptyState.Title>{searched ? 'No message matches' : 'Nothing left here'}</EmptyState.Title>
      <EmptyState.Actions>
        <Button variant="ghost" size="sm" label="Show every message" onPress={onReset} />
      </EmptyState.Actions>
    </EmptyState.Root>
  );
}

function useCardContext(view: NamespaceView, shared: readonly string[]): CardContext {
  const target = { project: view.project.id, locale: view.locale.language.tag, file: view.file };
  const confirming = useConfirmMessage(target);
  return {
    target,
    editable: view.viewer !== null,
    linked: useLinkedKey(),
    shared,
    confirm: { busy: confirming.busy, run: (key) => void confirming.confirm(key) },
  };
}

function Cards({
  groups,
  context,
}: Readonly<{ groups: readonly MessageGroup[]; context: CardContext }>) {
  return groups.map((group) => {
    const linked = group.rows.some((row) => row.key === context.linked);
    return (
      <MessageCard
        key={linked ? `${group.key}#${context.linked}` : group.key}
        group={group}
        context={context}
      />
    );
  });
}

function Messages({ view }: Readonly<{ view: NamespaceView }>) {
  const groups = useMemo(() => groupRows(view.rows), [view.rows]);
  const shared = useMemo(() => sharedNotes(groups), [groups]);
  const [fields] = useState<FieldActions>(() => new Map());
  const context = useCardContext(view, shared);
  const { list, shown, narrowed, reset } = useMessageList(groups, context.linked);
  useEditorKeys(fields);
  return (
    <EditorFields.Provider value={fields}>
      <Column gap={12}>
        <Notes notes={shared} />
        <EditorToolbar list={list} editable={context.editable} />
        {narrowed ? (
          <Text
            variant="meta"
            color="textDim"
          >{`Showing ${shown.length} of ${counted(groups.length, 'message')}`}</Text>
        ) : null}
        {shown.length === 0 ? (
          <NothingShown searched={list.query.trim() !== ''} onReset={reset} />
        ) : null}
        <Cards groups={shown} context={context} />
      </Column>
    </EditorFields.Provider>
  );
}

function MissingFile({ file }: Readonly<{ file: string }>) {
  const { owner, repo, locale } = Route.useParams();
  return (
    <LinguaPage>
      <EmptyState.Root icon="file-off">
        <EmptyState.Title>No such section</EmptyState.Title>
        <EmptyState.Hint>{`The source has no ${file} section.`}</EmptyState.Hint>
        <EmptyState.Actions>
          <Button icon="list" label="See every section" asChild>
            <RouteLink to="/$owner/$repo/$locale" params={{ owner, repo, locale }} />
          </Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    </LinguaPage>
  );
}

function Heading({ view }: Readonly<{ view: NamespaceView }>) {
  const { language } = view.locale;
  const done = view.rows.filter((row) => !isUntranslated(row)).length;
  const { percent } = completion({ done, total: view.rows.length });
  return (
    <Column gap={12}>
      <Trail project={view.project.id} language={language} section={view.file} />
      <PageHeader.Root>
        <PageHeader.Title>{view.file}</PageHeader.Title>
        <PageHeader.Subtitle>{`${language.name} · ${counted(view.rows.length, 'message')} · ${percent}% translated`}</PageHeader.Subtitle>
      </PageHeader.Root>
    </Column>
  );
}

function Editor({ view }: Readonly<{ view: NamespaceView }>) {
  const sending = useSending({ project: view.project.id, locale: view.locale.language.tag });
  useLanguageCommands(view, sending);
  const work = {
    sending: sending.sending,
    drafts: view.drafts,
    proposed: view.proposed,
    proposal: view.proposal,
  };
  return (
    <LinguaPage>
      <Heading view={view} />
      {view.viewer ? null : <SignInPrompt />}
      <Messages key={`${view.locale.language.tag}/${view.file}`} view={view} />
      {view.viewer ? <SendBar work={work} onSend={() => void sending.send()} /> : null}
    </LinguaPage>
  );
}

function NamespacePage() {
  const view = Route.useLoaderData();
  const { _splat: file = '' } = Route.useParams();
  return view ? <Editor view={view} /> : <MissingFile file={file} />;
}
