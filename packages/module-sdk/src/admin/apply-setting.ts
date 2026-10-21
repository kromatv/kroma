import type { SettingGroup, SettingRow } from '@kromatv/client/admin';

// A `secret`/`password` row records only WHETHER it now holds a value, not the
// value itself: the server never sends one back, and keeping it in state would
// put a signing key in the React tree for the rest of the session.
export function applySetting(groups: SettingGroup[], key: string, value: unknown): SettingGroup[] {
  const applied = (r: SettingRow): SettingRow =>
    r.kind === 'secret' || r.kind === 'password'
      ? { ...r, value: '', configured: Boolean(value) }
      : { ...r, value };
  return groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => (r.key === key ? applied(r) : r)),
  }));
}
