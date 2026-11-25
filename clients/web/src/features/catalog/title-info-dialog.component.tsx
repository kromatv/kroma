import { apiErrorText } from '@kromatv/client';
import {
  ItemId,
  ShowId,
  TITLE_EDIT_LIMITS,
  type TitleEdit,
  type TitleKind,
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
  kind: TitleKind | 'episode';
  id: string;
  title: string;
  shown?: TitleShown;
}>;

type Save = (edit: TitleEdit) => Promise<unknown>;

const upTo = (max: number) => (text: string) => text.slice(0, max);

const FIT: Readonly<Record<keyof TitleDraft, (text: string) => string>> = {
  title: upTo(TITLE_EDIT_LIMITS.title),
  originalTitle: upTo(TITLE_EDIT_LIMITS.title),
  sortTitle: upTo(TITLE_EDIT_LIMITS.title),
  tagline: upTo(TITLE_EDIT_LIMITS.tagline),
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

function useDraft(loaded: TitleDraft | undefined) {
  const [edited, setEdited] = useState<TitleDraft | null>(null);
  const change: Change = (field) => (text) =>
    setEdited((now) => {
      const base = now ?? loaded;
      return base ? { ...base, [field]: FIT[field](text) } : now;
    });
  return { draft: edited ?? loaded, change };
}

type Placeholders = Readonly<Partial<Record<keyof TitleDraft, string>>>;

const grey = (text: string | null) => text ?? undefined;

function placeholdersOf(shown: TitleShown | undefined): Placeholders {
  if (!shown) {
    return {};
  }
  return {
    title: shown.title,
    originalTitle: grey(shown.originalTitle),
    tagline: grey(shown.tagline),
    overview: grey(shown.overview),
    released: shown.year === null ? undefined : String(shown.year),
    genres: shown.genres.join(', ') || undefined,
  };
}

type Hinted = 'originalTitle' | 'sortTitle' | 'tagline' | 'released' | 'genres';

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
      <HintedField field="originalTitle" {...fields} />
      <HintedField field="sortTitle" {...fields} />
      <HintedField field="released" {...fields} />
      <HintedField field="tagline" {...fields} />
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

function InfoBody({
  fields: InfoFields,
  draft,
  change,
  placeholders,
  failure,
}: Readonly<Fields & { fields: (props: Fields) => ReactNode; failure: string | null }>) {
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

function Loading({ error }: Readonly<{ error: unknown }>) {
  const t = useT();
  return error ? <Failure text={apiErrorText(error, t('titleInfo.loadFailed'))} /> : <Spinner />;
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

function useInfoForm(props: Props, onDone: () => void) {
  const { data, error, save } = useTitleEdit(props);
  const { draft, change } = useDraft(data ? draftOf(data) : undefined);
  const { busy, failure, submit } = useSave(save, onDone);
  const fields = props.kind === 'episode' ? EpisodeFields : TitleFields;
  const body = { fields, change, failure, placeholders: placeholdersOf(props.shown) };
  return { draft, busy, submit, error, body };
}

/** The name, original title, sort title, release date, tagline, summary and
 * genres a person who manages the library writes by hand for a film or a show,
 * and the name, air date and summary for an episode (`kind: 'episode'`). Each
 * empty field shows in grey what the page shows instead (`shown`). Open with
 * `await TitleInfoDialog.call({ kind, id, title, shown })`; it resolves on
 * dismiss and once the edit is saved. */
export const TitleInfoDialog = createCallable<Props>((props) => {
  const t = useT();
  const close = () => props.call.end();
  const { draft, busy, submit, error, body } = useInfoForm(props, close);
  return (
    <Dialog.Root open title={props.title} width="lg" onClose={close}>
      <Dialog.Header>
        <TitleDialogHeading overline={t('titleInfo.title')} title={props.title} onClose={close} />
      </Dialog.Header>
      <Dialog.Panel>
        {draft ? <InfoBody draft={draft} {...body} /> : <Loading error={error} />}
      </Dialog.Panel>
      {draft ? (
        <Dialog.Footer>
          <SaveActions busy={busy} onCancel={close} onSave={() => submit(draft)} />
        </Dialog.Footer>
      ) : null}
    </Dialog.Root>
  );
});
