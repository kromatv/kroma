/** A query as an object. The encoder is the only place a value is coerced, so a
 * call site passes what it has and never writes `|| undefined`.
 *
 * `undefined`, `null`, `false` and `''` all mean "nothing to say" and drop out.
 * An ARRAY is a value: it joins with commas and is sent even when empty, which
 * is how `?copy=` ("decode none") stays distinct from no `copy` at all. */
export type QueryValue = string | number | boolean | readonly string[] | null | undefined;
export type Query = Readonly<Record<string, QueryValue>>;

function encode(value: QueryValue): string | undefined {
  if (Array.isArray(value)) return value.join(',');
  if (value === undefined || value === null || value === false || value === '') return undefined;
  return String(value);
}

export function queryString(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const encoded = encode(value);
    if (encoded !== undefined) params.set(key, encoded);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}
