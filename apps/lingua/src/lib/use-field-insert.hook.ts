import { useEffect, useRef } from 'react';
import { fieldOf, focusField, selectionOf } from '#site/lib/field-dom';
import { insertAt, type Selection } from '#site/lib/placeables';

/**
 * Inserting a token into message `key`'s field: at the caret while the field
 * has it, else where the caret was when it last left the field, else at the
 * end; the field takes the focus back with its caret after the token.
 */
export function useFieldInsert(key: string, value: string, setValue: (next: string) => void) {
  const caret = useRef<Selection | null>(null);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    if (pending.current === null) {
      return;
    }
    const field = fieldOf(key);
    if (field) {
      focusField(field, pending.current);
    }
    pending.current = null;
  });

  const remember = () => {
    const field = fieldOf(key);
    caret.current = field ? selectionOf(field) : caret.current;
  };

  const insert = (token: string) => {
    const field = fieldOf(key);
    const at = field && document.activeElement === field ? selectionOf(field) : caret.current;
    const next = insertAt(value, at, token);
    caret.current = { start: next.caret, end: next.caret };
    pending.current = next.caret;
    setValue(next.value);
  };

  return { insert, remember };
}
