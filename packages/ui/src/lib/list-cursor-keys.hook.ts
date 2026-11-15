import type { ListCursorKeysOptions } from './list-cursor-keys-types';

/** Binds a list's keyboard cursor; returns the cursor where the platform draws one. A
 *  television walks the rows with spatial focus, so it binds nothing. */
function useListCursorKeys<T>(_options: ListCursorKeysOptions<T>): T | undefined {
  return undefined;
}

export { useListCursorKeys };
