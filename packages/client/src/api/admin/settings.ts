import { z } from 'zod';

/** One editable (or read-only) setting row. `kind` (`toggle`|`select`|`text`|
 * `value`) is a plain string on the wire and `value` is an untyped `unknown`
 * (ts-rs `serde_json::Value`), so this is a flat object, not a tagged union. */
export const SettingRow = z.object({
  key: z.string(),
  label: z.string(),
  desc: z.string().nullish(),
  kind: z.string(),
  options: z.array(z.string()).default([]),
  value: z.unknown(),
  applied: z.boolean(),
  configured: z.boolean().nullish(),
});
export type SettingRow = z.infer<typeof SettingRow>;

/** A titled group of rows. */
export const SettingGroup = z.object({
  title: z.string(),
  desc: z.string().nullish(),
  rows: z.array(SettingRow),
});
export type SettingGroup = z.infer<typeof SettingGroup>;

/** `GET /api/admin/settings?view=…`. */
export const SettingsView = z.object({
  view: z.string(),
  groups: z.array(SettingGroup),
});
export type SettingsView = z.infer<typeof SettingsView>;
