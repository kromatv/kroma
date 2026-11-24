import { apiErrorText } from '@kromatv/client';
import {
  type ArtKind,
  ItemId,
  ShowId,
  TITLE_EDIT_LIMITS,
  type TitleEdit,
} from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { Box, Callout, Dialog, Field, Spinner, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { createCallable } from 'react-call';

import { TitleDialogHeader } from '#web/features/catalog/title-dialog-header.component';
import { draftOf, editOf, type TitleDraft } from '#web/features/catalog/title-info-draft';
import { useAuth } from '#web/shared/lib/auth';

type Props = Readonly<{ kind: ArtKind; id: string; title: string }>;

type Save = (edit: TitleEdit) => Promise<unknown>;

const upTo = (max: number) => (text: string) => text.slice(0, max);

const FIT: Readonly<Record<keyof TitleDraft, (text: string) => string>> = {
  title: upTo(TITLE_EDIT_LIMITS.title),
  overview: upTo(TITLE_EDIT_LIMITS.overview),
  released: (text) => text.replace(/[^\d-]/g, '').slice(0, 10),
  genres: upTo(TITLE_EDIT_LIMITS.genres * (TITLE_EDIT_LIMITS.genre + 2)),
};

function Failure({ text }: Readonly<{ text: string | null }>) {
  return text ? (
    <Callout.Root tone="danger">
      <Callout.Title>{text}</Callout.Title>
    </Callout.Root>
  ) : null;
}

function useSave(save: Save, onDone: () => void) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const submit = (draft: TitleDraft) => {
    setBusy(true);
    setFailure(null);
    save(editOf(draft))
      .then(onDone)
      .catch((e: unknown) => setFailure(apiErrorText(e, t('titleInfo.saveFailed'))))
      .finally(() => setBusy(false));
  };
  return { busy, failure, submit };
}

type Change = (field: keyof TitleDraft) => (text: string) => void;

function useDraft(initial: TitleDraft) {
  const [draft, setDraft] = useState(initial);
  const change: Change = (field) => (text) =>
    setDraft((now) => ({ ...now, [field]: FIT[field](text) }));
  return { draft, change };
}

function InfoFields({ draft, change }: Readonly<{ draft: TitleDraft; change: Change }>) {
  const t = useT();
  return (
    <>
      <Field.Root label={t('titleInfo.name')} value={draft.title} onValueChange={change('title')} />
      <Field.Root
        label={t('titleInfo.released')}
        value={draft.released}
        onValueChange={change('released')}
      >
        <Field.Hint>{t('titleInfo.releasedHint')}</Field.Hint>
      </Field.Root>
      <Field.Root label={t('titleInfo.summary')}>
        <Field.Textarea
          rows={4}
          maxRows={10}
          value={draft.overview}
          onValueChange={change('overview')}
        />
      </Field.Root>
      <Field.Root
        label={t('titleInfo.genres')}
        value={draft.genres}
        onValueChange={change('genres')}
      >
        <Field.Hint>{t('titleInfo.genresHint')}</Field.Hint>
      </Field.Root>
    </>
  );
}

function SaveFooter({
  busy,
  onCancel,
  onSave,
}: Readonly<{ busy: boolean; onCancel: () => void; onSave: () => void }>) {
  const t = useT();
  return (
    <Dialog.Footer>
      <Dialog.Actions
        onCancel={onCancel}
        cancelLabel={t('common.cancel')}
        onConfirm={onSave}
        confirmLabel={t('common.save')}
        busy={busy}
      />
    </Dialog.Footer>
  );
}

function InfoForm({
  initial,
  save,
  onDone,
}: Readonly<{ initial: TitleDraft; save: Save; onDone: () => void }>) {
  const t = useT();
  const { draft, change } = useDraft(initial);
  const { busy, failure, submit } = useSave(save, onDone);
  return (
    <>
      <Dialog.Panel>
        <Box gap={16}>
          <Text variant="meta" color="white/55">
            {t('titleInfo.hint')}
          </Text>
          <InfoFields draft={draft} change={change} />
          <Failure text={failure} />
        </Box>
      </Dialog.Panel>
      <SaveFooter busy={busy} onCancel={onDone} onSave={() => submit(draft)} />
    </>
  );
}

function useTitleEdit({ kind, id }: Props) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['title-edit', kind, id] as const;
  const subject = kind === 'show' ? ShowId.parse(id) : ItemId.parse(id);
  const query = useQuery({ queryKey, queryFn: () => client.media.titleEdits.get(kind, subject) });
  const save = (edit: TitleEdit) =>
    client.media.titleEdits
      .put(kind, subject, edit)
      .then((kept) => queryClient.setQueryData(queryKey, kept));
  return { ...query, save };
}

/** The name, release date, summary and genres a person who manages the library writes
 * by hand for a film or a show. Open with `await TitleInfoDialog.call({ kind,
 * id, title })`; it resolves on dismiss and once the edit is saved. */
export const TitleInfoDialog = createCallable<Props>((props) => {
  const t = useT();
  const { data, error, save } = useTitleEdit(props);
  const close = () => props.call.end();
  return (
    <Dialog.Root open title={props.title} width="lg" onClose={close}>
      <TitleDialogHeader overline={t('titleInfo.title')} title={props.title} onClose={close} />
      {data ? (
        <InfoForm initial={draftOf(data)} save={save} onDone={close} />
      ) : (
        <Dialog.Panel>
          {error ? <Failure text={apiErrorText(error, t('titleInfo.loadFailed'))} /> : <Spinner />}
        </Dialog.Panel>
      )}
    </Dialog.Root>
  );
});
