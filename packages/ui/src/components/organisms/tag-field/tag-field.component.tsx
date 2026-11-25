import { Fragment, type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { type EnclosingField, useEnclosingField } from '#ui/components/molecules/field';
import { useControl } from '#ui/lib/control';
import { type ControlSize, useEntryDefaults } from '#ui/lib/field-shell';
import { partsOf } from '#ui/lib/parts';
import { useStableCallback } from '#ui/lib/stable-callback.hook';
import {
  type SurfacePresentation,
  useSurfacePresentation,
} from '#ui/lib/surface-presentation.hook';
import { useTDefault } from '#ui/services/i18n';
import { TagFieldContext, type TagFieldDetails, type TagFieldState } from './tag-field-context';
import { tagFieldControl } from './tag-field-control';
import { TagFieldDialog } from './tag-field-dialog.component';
import { Item, type TagFieldItemProps } from './tag-field-item';
import { tagMetrics } from './tag-field-metrics';
import { TagFieldPanel } from './tag-field-panel.component';
import { Empty, Hint, Media } from './tag-field-parts.component';
import { suggestionsOf } from './tag-field-suggestions';
import type { TagFieldSurfaceProps } from './tag-field-surface';
import { Tag } from './tag-field-tag.component';

export type { TagFieldDetails, TagFieldReason } from './tag-field-context';
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

interface Enclosed {
  label: string;
  invalid: boolean;
  size: ControlSize | undefined;
  onFocusChange: (focused: boolean) => void;
}

type ResolvedProps = Omit<TagFieldRootProps, keyof Enclosed> & Enclosed;

const IGNORE_FOCUS = () => undefined;

function labelOf(props: Readonly<TagFieldRootProps>, field: EnclosingField | null): string {
  return props.label ?? field?.label ?? props.placeholder ?? '';
}

function useEnclosed(props: Readonly<TagFieldRootProps>): ResolvedProps {
  const field = useEnclosingField();
  return {
    ...props,
    label: labelOf(props, field),
    invalid: props.invalid ?? field?.invalid ?? false,
    size: props.size ?? field?.size,
    onFocusChange: field?.setFocused ?? IGNORE_FOCUS,
  };
}

function useTagFieldControl(props: Readonly<ResolvedProps>) {
  const { onValueChange } = props;
  const [control] = useControl(tagFieldControl, {
    ...props,
    onValueChange: (next: readonly string[], details: TagFieldDetails) =>
      onValueChange?.([...next], details),
  });
  return control;
}

function useFaces() {
  const [faces, setFaces] = useState<ReadonlyMap<string, ReactNode>>(() => new Map());
  const remember = useStableCallback((name: string, face: ReactNode) => {
    if (face !== null && faces.get(name) !== face) {
      setFaces((held) => new Map(held).set(name, face));
    }
  });
  return { faces, remember };
}

function drawnTags(children: ReactNode, value: readonly string[]): ReactElement[] {
  const written = new Map(partsOf(children, Tag).map((tag) => [tag.props.value, tag]));
  return value.map((name) => (
    <Fragment key={name}>{written.get(name) ?? <Tag value={name} />}</Fragment>
  ));
}

function useFieldState(props: Readonly<ResolvedProps>) {
  const control = useTagFieldControl(props);
  const { faces, remember } = useFaces();
  const presentation = useSurfacePresentation(props.presentation);
  const entry = useEntryDefaults();
  const metrics = tagMetrics(props.size ?? entry.size);
  const pick = useStableCallback((name: string, face: ReactNode) => {
    remember(name, face);
    control.add(name);
  });
  const { query, remove } = control;
  const disabled = props.disabled ?? false;
  const field = useMemo<TagFieldState>(
    () => ({ label: props.label, query, metrics, presentation, disabled, faces, pick, remove }),
    [props.label, query, metrics, presentation, disabled, faces, pick, remove],
  );
  return { control, field, pick };
}

function useSurface(props: Readonly<ResolvedProps>) {
  const t = useTDefault();
  const { control, field, pick } = useFieldState(props);
  const items = partsOf<TagFieldItemProps>(props.children, Item);
  const suggested = suggestionsOf(items, {
    value: control.value,
    query: control.query,
    filter: props.filter ?? true,
    nameOf: (item) => item.props.value,
  });
  const words = props.addLabel ?? ((name: string) => t('tagField.add', { name }));
  const surface: TagFieldSurfaceProps = {
    control,
    label: props.label,
    placeholder: props.placeholder,
    tags: drawnTags(props.children, control.value),
    suggested,
    empty: emptyOf(props.children),
    loading: props.loading ?? false,
    freeLabel: suggested.free === null ? null : words(suggested.free),
    full: control.value.length >= control.max,
    disabled: field.disabled,
    invalid: props.invalid,
    metrics: field.metrics,
    onFocusChange: props.onFocusChange,
    pick,
  };
  return { field, surface };
}

function emptyOf(children: ReactNode): ReactNode {
  const written = partsOf(children, Empty);
  return written.length > 0 ? written : null;
}

/** Owns the names, what is typed after them and whether the suggestions are
 *  open, and draws the well: the tags, then the entry. Under a pointer the
 *  suggestions hang under it and the keys run from the entry; under a D-pad
 *  each tag is a stop and the entry opens a dialog with the keyboard. Wear it
 *  inside a <Field.Root>, which draws the label row and the <Field.Hint> and
 *  lends it its label, its error and its size. */
function Root(props: Readonly<TagFieldRootProps>) {
  const { field, surface } = useSurface(useEnclosed(props));
  return (
    <TagFieldContext value={field}>
      {field.presentation === 'dialog' ? (
        <TagFieldDialog {...surface} />
      ) : (
        <TagFieldPanel {...surface} />
      )}
    </TagFieldContext>
  );
}

const TagField = { Root, Tag, Item, Media, Hint, Empty };

export type { TagFieldItemProps, TagFieldRootProps };
export { TagField };
