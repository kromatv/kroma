import { Fragment, type ReactElement, type ReactNode, useMemo } from 'react';
import {
  type EnclosedEntry,
  useEnclosedEntry,
} from '#ui/components/organisms/suggestions/enclosed-entry.hook';
import { useSuggestingField } from '#ui/components/organisms/suggestions/suggesting-field.hook';
import { SuggestingContext } from '#ui/components/organisms/suggestions/suggestion-context';
import {
  suggestionList,
  surfaceEntry,
} from '#ui/components/organisms/suggestions/suggestion-surface';
import type { Suggestion } from '#ui/components/organisms/suggestions/suggestions-of';
import { useControl } from '#ui/lib/control';
import type { ControlSize } from '#ui/lib/field-shell';
import { partsOf } from '#ui/lib/parts';
import type { SurfacePresentation } from '#ui/lib/surface-presentation.hook';
import { useTDefault } from '#ui/services/i18n';
import { TagFieldContext, type TagFieldDetails, type TagFieldState } from './tag-field-context';
import { tagFieldControl } from './tag-field-control';
import { TagFieldDialog } from './tag-field-dialog.component';
import { FreeRow, Item } from './tag-field-item.component';
import { TagFieldPanel } from './tag-field-panel.component';
import { Empty, Hint, Media } from './tag-field-parts.component';
import { Tag } from './tag-field-tag.component';

export type { TagFieldDetails, TagFieldReason } from './tag-field-context';
export type { TagFieldItemProps } from './tag-field-item.component';
export type { TagFieldMediaProps } from './tag-field-parts.component';
export type { TagFieldTagProps } from './tag-field-tag.component';

interface TagFieldRootProps {
  /** Names the entry to assistive tech; nothing draws it. Defaults to the label
   *  of the <Field.Root> around it, then to the placeholder. */
  label?: string;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (next: string[], details: TagFieldDetails) => void;
  /** What is typed after the tags: what a caller searching for suggestions
   *  searches with. A comma or a pasted list moves it into the value. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (next: string, details: TagFieldDetails) => void;
  /** Whether the suggestions are asked for. They draw only when there is
   *  something to show and room for another name. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: TagFieldDetails) => void;
  /** Adding stops at this many names; the tags can still be taken out. */
  max?: number;
  /** What the entry reads while there is no tag and nothing typed. No
   *  default: the product is not in this file's language. */
  placeholder?: string;
  /** Matches the items against the query, best first. Defaults to true; false
   *  for suggestions a search already matched, drawn in the order written. */
  filter?: boolean;
  /** Draws a row saying suggestions are on their way, in the place of
   *  <TagField.Empty> while nothing has arrived. */
  loading?: boolean;
  /** The words of the row that adds the typed text as it is, defaulting to the
   *  kit's "Add “{name}”". */
  addLabel?: (name: string) => string;
  /** The control shell's size: the <Field.Root>'s around it, else the app's
   *  (`KitProvider`). */
  size?: ControlSize;
  /** Defaults to the <Field.Root>'s around it, which its `error` turns on. */
  invalid?: boolean;
  disabled?: boolean;
  /** Where the suggestions appear: `auto` (the default) asks the shell, then
   *  the platform - a dialog under a D-pad, a list anchored to the field under
   *  a pointer. */
  presentation?: SurfacePresentation;
  /** <TagField.Tag>s, <TagField.Item>s and a <TagField.Empty>, as DIRECT
   *  children, in any order. */
  children?: ReactNode;
}

type ResolvedProps = EnclosedEntry<TagFieldRootProps>;

const FREE_KEY = 'tag-field:free';

const LIST_PARTS = { Item, Media, Empty };

type Words = (name: string) => string;

function useTagFieldControl(props: Readonly<ResolvedProps>) {
  const { onValueChange } = props;
  const [control] = useControl(tagFieldControl, {
    ...props,
    onValueChange: (next: readonly string[], details: TagFieldDetails) =>
      onValueChange?.([...next], details),
  });
  return control;
}

function drawnTags(children: ReactNode, value: readonly string[]): ReactElement[] {
  const written = new Map(partsOf(children, Tag).map((tag) => [tag.props.value, tag]));
  return value.map((name) => (
    <Fragment key={name}>{written.get(name) ?? <Tag value={name} />}</Fragment>
  ));
}

function freeRow(name: string | null, words: Words): Suggestion | null {
  if (name === null) {
    return null;
  }
  const node = <FreeRow key={FREE_KEY} name={name} label={words(name)} />;
  return { key: FREE_KEY, name, face: null, disabled: false, node };
}

function useSurface(props: Readonly<ResolvedProps>) {
  const t = useTDefault();
  const control = useTagFieldControl(props);
  const { query, add, remove } = control;
  const { field, faces, metrics } = useSuggestingField({ ...props, query, take: add });
  const { presentation } = field;
  const { disabled } = props;
  const state = useMemo<TagFieldState>(
    () => ({ metrics, presentation, disabled, faces, remove }),
    [metrics, presentation, disabled, faces, remove],
  );
  const list = suggestionList(props.children, LIST_PARTS, {
    ...props,
    value: control.value,
    query,
  });
  const words = props.addLabel ?? ((name: string) => t('tagField.add', { name }));
  const entry = surfaceEntry(control, {
    text: query,
    closed: control.value.length >= control.max,
    onNone: () => false,
  });
  const trailing = freeRow(list.suggested.free, words);
  const surface = { field, metrics, look: props, entry, list: { ...list, trailing } };
  const tags = drawnTags(props.children, control.value);
  return { state, field, drawn: { surface, control, full: entry.closed, tags } };
}

/** Owns the names, what is typed after them and whether the suggestions are
 *  open, and draws the well: the tags, then the entry. Under a pointer the
 *  suggestions hang under it and the keys run from the entry; under a D-pad
 *  each tag is a stop and the entry opens a dialog with the keyboard. Wear it
 *  inside a <Field.Root>, which draws the label row and the <Field.Hint> and
 *  lends it its label, its error and its size. */
function Root(props: Readonly<TagFieldRootProps>) {
  const { state, field, drawn } = useSurface(useEnclosedEntry(props));
  return (
    <TagFieldContext value={state}>
      <SuggestingContext value={field}>
        {field.presentation === 'dialog' ? (
          <TagFieldDialog {...drawn} />
        ) : (
          <TagFieldPanel {...drawn} />
        )}
      </SuggestingContext>
    </TagFieldContext>
  );
}

const TagField = { Root, Tag, Item, Media, Hint, Empty };

export type { TagFieldRootProps };
export { TagField };
