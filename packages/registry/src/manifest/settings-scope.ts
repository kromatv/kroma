import { z } from 'zod';

// A core settings key: camelCase, or dotted for the namespaced ones
// (`notifications.vapid.publicKey`). Matched exactly, so the spelling has to be.
const SettingKey = z.string().regex(/^[A-Za-z]\w*(?:\.[A-Za-z]\w*)*$/);

/** The CORE settings keys a module reads and writes. */
export const SettingsScope = z.object({
  read: z
    .array(SettingKey)
    .nullish()
    .describe(
      'Core settings keys this module reads through the host callback. A key this list omits is refused, and so is one the server keeps to itself.',
    ),
  write: z
    .array(SettingKey)
    .nullish()
    .describe(
      'Core settings keys this module writes. A read declaration is not a write declaration, a patch naming a key this list omits is refused whole, and an update that adds a key here waits for the operator.',
    ),
});
export type SettingsScope = z.infer<typeof SettingsScope>;
