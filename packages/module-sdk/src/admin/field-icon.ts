import type { EngineField } from '@kromatv/client/modules';
import type { IconName } from '@kromatv/ui/kit';

const BY_KEY: Record<string, IconName> = {
  url: 'link',
  address: 'link',
  host: 'server',
  username: 'user',
  user: 'user',
  email: 'mail',
  token: 'key',
  apiKey: 'key',
};

/** The glyph a declared field wears in a form: a lock on a secret, else the
 * one its key is known by, else none. */
export function fieldIcon(field: EngineField): IconName | undefined {
  return field.secret ? 'lock' : BY_KEY[field.key];
}
