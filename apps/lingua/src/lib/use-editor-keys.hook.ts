import { createContext, useEffect } from 'react';
import { neighbour, type Shortcut, shortcutOf } from '#site/lib/editor-keys';
import { focusField, keyOfField, messageFields } from '#site/lib/field-dom';

/** What each message field of the editor does on Alt+V (⌥V on a Mac), by message key. */
export type FieldActions = Map<string, () => void>;

/** The editor's field actions, which each message field registers its own in. */
export const EditorFields = createContext<FieldActions>(new Map());

function moveFrom(
  field: HTMLTextAreaElement,
  shortcut: Exclude<Shortcut, 'insert-variable'>,
): void {
  const next = neighbour(messageFields(), field, shortcut === 'previous' ? -1 : 1);
  if (next) {
    focusField(next);
  } else if (shortcut === 'save-next') {
    field.blur();
  }
}

function onEditorKey(event: KeyboardEvent, fields: FieldActions): void {
  const field = event.target;
  if (!(field instanceof HTMLTextAreaElement)) {
    return;
  }
  const key = keyOfField(field);
  const shortcut = shortcutOf(event);
  if (key === null || shortcut === null) {
    return;
  }
  event.preventDefault();
  if (shortcut === 'insert-variable') {
    fields.get(key)?.();
  } else {
    moveFrom(field, shortcut);
  }
}

/**
 * The editor's keyboard, from inside a message field: Ctrl or ⌘ with Enter
 * saves and goes to the next field, with ↓ and ↑ moves between fields, and
 * Alt+V (⌥V on a Mac) runs the field's own action. Blurring a field is what saves it.
 */
export function useEditorKeys(fields: FieldActions): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onEditorKey(event, fields);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fields]);
}
