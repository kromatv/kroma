import { apiErrorText } from '@kromatv/client';
import {
  ItemId,
  ShowId,
  TITLE_EDIT_LIMITS,
  type TitleEdit,
  type TitleKind,
} from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type CastDraft, castDraftOf, castOf } from '#web/features/catalog/title-cast-draft';
import {
  draftOf,
  editOf,
  type Names,
  type TitleDraft,
} from '#web/features/catalog/title-info-draft';
import type { TitleShown } from '#web/features/catalog/title-shown';
import { useAuth } from '#web/shared/lib/auth';

/** The title a dialog edits: a film or a show, or an episode, which is an
 * item with fewer fields. */
export type InfoSubject = Readonly<{
  kind: TitleKind | 'episode';
  id: string;
  shown?: TitleShown;
}>;

/** A field of the form that holds text. */
export type TextKey = Exclude<keyof TitleDraft, ListKey>;

/** A field of the form that holds names. */
export type ListKey = 'genres' | 'directors' | 'studios';

const upTo = (max: number) => (text: string) => text.slice(0, max);

const FIT: Readonly<Record<TextKey, (text: string) => string>> = {
  title: upTo(TITLE_EDIT_LIMITS.title),
  originalTitle: upTo(TITLE_EDIT_LIMITS.title),
  sortTitle: upTo(TITLE_EDIT_LIMITS.title),
  tagline: upTo(TITLE_EDIT_LIMITS.tagline),
  overview: upTo(TITLE_EDIT_LIMITS.overview),
  released: (text) => text.replace(/[^\d-]/g, '').slice(0, 10),
  contentRating: upTo(TITLE_EDIT_LIMITS.contentRating),
};

function useTitleEdit({ kind: asked, id }: InfoSubject) {
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

function useSave(save: (edit: TitleEdit) => Promise<unknown>, onDone: () => void) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const submit = (edit: TitleEdit) => {
    setBusy(true);
    setFailure(null);
    save(edit)
      .then(onDone)
      .catch((e: unknown) => setFailure(apiErrorText(e, t('titleInfo.saveFailed'))))
      .finally(() => setBusy(false));
  };
  return { busy, failure, submit };
}

function useDraft(loaded: TitleDraft | undefined) {
  const [edited, setEdited] = useState<TitleDraft | null>(null);
  const put = (change: Partial<TitleDraft>) =>
    setEdited((now) => {
      const base = now ?? loaded;
      return base ? { ...base, ...change } : now;
    });
  const change = (field: TextKey) => (text: string) => put({ [field]: FIT[field](text) });
  const setNames = (field: ListKey) => (names: Names) => put({ [field]: names });
  return { draft: edited ?? loaded, change, setNames };
}

function useCast(written: TitleEdit['cast'] | undefined, shown: TitleShown | undefined) {
  const [edited, setEdited] = useState<CastDraft | null>(null);
  const cast = edited ?? castDraftOf(written ?? null, shown?.cast ?? []);
  const reset = () => setEdited(castDraftOf(null, written ? [] : (shown?.cast ?? [])));
  return { cast, onCast: setEdited, resetCast: reset };
}

/** Everything the Edit info form reads and does: what was written when it
 * opened (`loaded`), the draft, how each field changes, the cast, and the save
 * that resolves `onDone` once the server kept the edit. */
export function useTitleInfo(subject: InfoSubject, onDone: () => void) {
  const { data, error, save } = useTitleEdit(subject);
  const loaded = data ? draftOf(data) : undefined;
  const { draft, change, setNames } = useDraft(loaded);
  const { cast, onCast, resetCast } = useCast(data?.cast, subject.shown);
  const { busy, failure, submit: send } = useSave(save, onDone);
  const submit = (asked: TitleDraft) => send({ ...editOf(asked), cast: castOf(cast) });
  const castWritten = Boolean(data?.cast);
  return {
    loaded,
    draft,
    change,
    setNames,
    cast,
    onCast,
    resetCast,
    castWritten,
    busy,
    failure,
    submit,
    error,
  };
}

/** What `useTitleInfo` gives a form. */
export type TitleInfo = ReturnType<typeof useTitleInfo>;
