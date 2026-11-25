import { useT } from '@kromatv/ui';
import { Field } from '@kromatv/ui/kit';
import type { TitleDraft } from '#web/features/catalog/title-info-draft';
import { resetAction } from '#web/features/catalog/title-info-reset';
import type { TitleShown } from '#web/features/catalog/title-shown';
import type { TextKey, TitleInfo } from '#web/features/catalog/use-title-info.hook';

/** The form once what was written has loaded. */
export type ReadyInfo = Omit<TitleInfo, 'draft' | 'loaded'> &
  Readonly<{ draft: TitleDraft; loaded: TitleDraft; shown?: TitleShown }>;

const LABEL = {
  title: 'titleInfo.name',
  originalTitle: 'titleInfo.originalTitle',
  sortTitle: 'titleInfo.sortTitle',
  tagline: 'titleInfo.tagline',
  overview: 'titleInfo.summary',
  released: 'titleInfo.released',
  contentRating: 'titleInfo.contentRating',
} as const;

const HINT = {
  title: null,
  originalTitle: 'titleInfo.originalTitleHint',
  sortTitle: 'titleInfo.sortTitleHint',
  tagline: 'titleInfo.taglineHint',
  overview: null,
  released: 'titleInfo.releasedHint',
  contentRating: 'titleInfo.contentRatingHint',
} as const;

const PAGE_TEXT: Readonly<Record<TextKey, (shown: TitleShown) => string | null | undefined>> = {
  title: (shown) => shown.title,
  originalTitle: (shown) => shown.originalTitle,
  sortTitle: () => undefined,
  tagline: (shown) => shown.tagline,
  overview: (shown) => shown.overview,
  released: (shown) => (shown.year === null ? undefined : String(shown.year)),
  contentRating: (shown) => shown.ageRating?.label,
};

function pageText(info: ReadyInfo, field: TextKey) {
  if (!info.shown || info.loaded[field] !== '') {
    return undefined;
  }
  return PAGE_TEXT[field](info.shown) ?? undefined;
}

function useNote(info: ReadyInfo, field: TextKey, hint: string | undefined) {
  const t = useT();
  if (info.loaded[field] !== '' && info.draft[field] === '') {
    return t('titleInfo.resetNote');
  }
  const own = HINT[field];
  return hint ?? (own ? t(own) : null);
}

type TextProps = Readonly<{ info: ReadyInfo; field: TextKey; label?: string; hint?: string }>;

/** One text field of the form: what was written, or what the page shows in
 * grey, and a reset while it holds text. */
export function TextEntry({ info, field, label, hint }: TextProps) {
  const t = useT();
  const text = info.draft[field];
  const note = useNote(info, field, hint);
  const placeholder = pageText(info, field);
  return (
    <Field.Root label={label ?? t(LABEL[field])} value={text} onValueChange={info.change(field)}>
      {field === 'overview' ? (
        <Field.Textarea rows={4} maxRows={10} placeholder={placeholder} />
      ) : (
        <Field.Input placeholder={placeholder} />
      )}
      {resetAction(t('titleInfo.reset'), text === '' ? null : () => info.change(field)(''))}
      <Field.Hint>{note}</Field.Hint>
    </Field.Root>
  );
}
