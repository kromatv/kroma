import type { EngineChoice } from '@kromatv/module-sdk';
import type { EngineField } from '@kromatv/client/modules';
import type { DownloadClientView, SaveDownloadClientBody } from './schemas';

const COLUMNS = new Set(['name', 'url', 'username', 'password']);

/** The fields a client of an engine nothing describes is edited with: the three
 * every download client had before engines declared their own. */
export const FALLBACK_FIELDS: EngineField[] = [
  { key: 'url', label: 'field.url', type: 'string', required: true },
  { key: 'username', label: 'field.username', type: 'string' },
  { key: 'password', label: 'field.password', type: 'string', secret: true },
];

/** The fields client `kind` is edited with: what its engine declares, or the
 * fallback when no enabled engine describes it. */
export function fieldsOf(engines: readonly EngineChoice[], kind: string): EngineField[] {
  return engines.find((e) => e.id === kind)?.fields ?? FALLBACK_FIELDS;
}

/** Whether the server holds a secret for this client, which an empty field keeps. */
export function keepsSecrets(
  client: Pick<DownloadClientView, 'hasPassword' | 'configuredSettings'>,
) {
  return client.hasPassword || client.configuredSettings.length > 0;
}

/** Every declared field's value, empty for one left untouched. */
export function declaredValues(
  fields: readonly EngineField[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? '']));
}

/** The save body for an engine's form values: the URL and credentials in their
 * own fields, every other declared field under `settings`. An empty secret or
 * setting is sent empty, which keeps what the server stores. */
export function clientBody(
  values: Readonly<Record<string, string>>,
): Pick<SaveDownloadClientBody, 'name' | 'url' | 'username' | 'password' | 'settings'> {
  const settings = Object.fromEntries(Object.entries(values).filter(([key]) => !COLUMNS.has(key)));
  return {
    name: values.name?.trim() || null,
    url: values.url?.trim() || null,
    username: values.username === undefined ? null : values.username.trim(),
    password: values.password || null,
    settings,
  };
}
