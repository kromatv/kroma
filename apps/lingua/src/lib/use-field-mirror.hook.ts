import { useEffect, useState } from 'react';
import { type FieldBox, fieldOf, measureField } from '#site/lib/field-dom';

/**
 * Follows where message `key`'s field draws its text, inside the element
 * marked `data-mirror`, as it grows, scrolls and is typed in, and points the
 * field at `describedBy` for assistive tech. Null until it is measured.
 */
export function useFieldMirror(key: string, describedBy: string): FieldBox | null {
  const [box, setBox] = useState<FieldBox | null>(null);
  useEffect(() => {
    const field = fieldOf(key);
    const host = field?.closest('[data-mirror]');
    if (!field || !host) {
      return undefined;
    }
    field.setAttribute('aria-describedby', describedBy);
    const measure = () => setBox(measureField(field, host));
    const observer = new ResizeObserver(measure);
    observer.observe(field);
    field.addEventListener('scroll', measure);
    field.addEventListener('input', measure);
    return () => {
      observer.disconnect();
      field.removeEventListener('scroll', measure);
      field.removeEventListener('input', measure);
    };
  }, [key, describedBy]);
  return box;
}
