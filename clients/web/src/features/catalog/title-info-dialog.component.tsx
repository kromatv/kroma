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
import { type ReactNode, useState } from 'react';
import { createCallable } from 'react-call';

import { TitleDialogHeading } from '#web/features/catalog/title-dialog-heading.component';
import { draftOf, editOf, type TitleDraft } from '#web/features/catalog/title-info-draft';
import type { TitleShown } from '#web/features/catalog/title-shown';
import { useAuth } from '#web/shared/lib/auth';

type Props = Readonly<{
  kind: ArtKind | 'episode';
  id: string;
  title: string;
  shown?: TitleShown;
}>;

type Save = (edit: TitleEdit) => Promise<unknown>;

const upTo = (max: number) => (text: string) => text.slice(0, max);

const FIT: Readonly<Record<keyof TitleDraft, (text: string) => string>> = {
  title: upTo(TITLE_EDIT_LIMITS.title),
  sortTitle: upTo(TITLE_EDIT_LIMITS.title),
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

function useDraft(saved: TitleEdit | undefined) {
  const [edited, setEdited] = useState<TitleDraft | null>(null);
  const draft = edited ?? (saved ? draftOf(saved) : null);
  const change: Change = (field) => (text) => {
    if (draft) {
      setEdited((now) => ({ ...(now ?? draft), [field]: FIT[field](text) }));
    }
  };
  return { draft, change };
}

type Placeholders = Readonly<Partial<Record<keyof TitleDraft, string>>>;

function placeholdersOf(shown: TitleShown | undefined): Placeholders {
  if (!shown) {
    return {};
  }
  return {
    title: shown.title,
    overview: shown.overview ?? undefined,
    released: shown.year === null ? undefined : String(shown.year),
    genres: shown.genres.join(', ') || undefined,
  };
}

type Hinted = 'sortTitle' | 'released' | 'genres';

type Fields = Readonly<{ draft: TitleDraft; change: Change; placeholders: Placeholders }>;

function HintedField({ field, ...fields }: Fields & Readonly<{ field: Hinted }>) {
  const t = useT();
  return (
    <Field.Root
      label={t(`titleInfo.${field}`)}
      value={fields.draft[field]}
      onValueChange={fields.change(field)}
    >
      <Field.Input placeholder={fields.placeholders[field]} />
      <Field.Hint>{t(`titleInfo.${field}Hint`)}</Field.Hint>
    </Field.Root>
  );
}

function NameField({ draft, change, placeholders }: Fields) {
  const t = useT();
  return (
    <Field.Root label={t('titleInfo.name')} value={draft.title} onValueChange={change('title')}>
      <Field.Input placeholder={placeholders.title} />
    </Field.Root>
  );
}

function SummaryField({ draft, change, placeholders }: Fields) {
  const t = useT();
  return (
    <Field.Root label={t('titleInfo.summary')}>
      <Field.Textarea
        rows={4}
        maxRows={10}
        value={draft.overview}
        onValueChange={change('overview')}
        placeholder={placeholders.overview}
      />
    </Field.Root>
  );
}

function TitleFields(fields: Fields) {
  return (
    <>
      <NameField {...fields} />
      <HintedField field="sortTitle" {...fields} />
      <HintedField field="released" {...fields} />
      <SummaryField {...fields} />
      <HintedField field="genres" {...fields} />
    </>
  );
}

function EpisodeFields(fields: Fields) {
  const t = useT();
  return (
    <>
      <NameField {...fields} />
      <Field.Root
        label={t('titleInfo.aired')}
        value={fields.draft.released}
        onValueChange={fields.change('released')}
      >
        <Field.Hint>{t('titleInfo.airedHint')}</Field.Hint>
      </Field.Root>
      <SummaryField {...fields} />
    </>
  );
}

function InfoPanel({
  fields: InfoFields,
  draft,
  change,
  placeholders,
  failure,
}: Fields &
  Readonly<{
    fields: (props: Fields) => ReactNode;
    failure: string | null;
  }>) {
  const t = useT();
  return (
    <Box gap={16}>
      <Text variant="meta" color="white/55">
        {t('titleInfo.hint')}
      </Text>
      <InfoFields draft={draft} change={change} placeholders={placeholders} />
      <Failure text={failure} />
    </Box>
  );
}

function useTitleEdit({ kind: asked, id }: Props) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const kind = asked === 'episode' ? 'item' : asked;
  const queryKey = ['title-edit', kind, id] as const;
  const subject = kind === 'show' ? ShowId.parse(id) : ItemId.parse(id);
  const query = useQuery({ queryKey, queryFn: () => client.media.titleEdits.get(kind, subject) });
  const save = (edit: TitleEdit) =>
    client.media.titleEdits
      .put(kind, subject, edit)
      .then((kept) => queryClient.setQueryData(queryKey, kept));
  return { ...query, save };
}

function saveBand(save: Readonly<{ busy: boolean; onCancel: () => void; onSave: () => void }>) {
  return (
    <Dialog.Footer>
      <SaveActions {...save} />
    </Dialog.Footer>
  );
}

function SaveActions({
  busy,
  onCancel,
  onSave,
}: Readonly<{ busy: boolean; onCancel: () => void; onSave: () => void }>) {
  const t = useT();
  return (
    <Dialog.Actions
      onCancel={onCancel}
      cancelLabel={t('common.cancel')}
      onConfirm={onSave}
      confirmLabel={t('common.save')}
      busy={busy}
    />
  );
}

function Loading({ error }: Readonly<{ error: unknown }>) {
  const t = useT();
  return error ? <Failure text={apiErrorText(error, t('titleInfo.loadFailed'))} /> : <Spinner />;
}

/** The name, sort title, release date, summary and genres a person who
 * manages the library writes by hand for a film or a show, and the name, air
 * date and summary for an episode (`kind: 'episode'`). Each empty field shows
 * in grey what the page shows instead (`shown`). Open with `await
 * TitleInfoDialog.call({ kind, id, title, shown })`; it resolves on dismiss and
 * once the edit is saved. */
export const TitleInfoDialog = createCallable<Props>((props) => {
  const t = useT();
  const { data, error, save } = useTitleEdit(props);
  const close = () => props.call.end();
  const { draft, change } = useDraft(data);
  const { busy, failure, submit } = useSave(save, close);
  return (
    <Dialog.Root open title={props.title} width="lg" onClose={close}>
      <Dialog.Header>
        <TitleDialogHeading overline={t('titleInfo.title')} title={props.title} onClose={close} />
      </Dialog.Header>
      <Dialog.Panel>
        {draft ? (
          <InfoPanel
            fields={props.kind === 'episode' ? EpisodeFields : TitleFields}
            draft={draft}
            change={change}
            placeholders={placeholdersOf(props.shown)}
            failure={failure}
          />
        ) : (
          <Loading error={error} />
        )}
      </Dialog.Panel>
      {draft ? saveBand({ busy, onCancel: close, onSave: () => submit(draft) }) : null}
    </Dialog.Root>
  );
});
