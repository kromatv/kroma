import { z } from 'zod';

const MessageKey = z.string().min(1);

/** One kind of notification a module sends. */
export const NotificationType = z.object({
  type: z
    .string()
    .regex(/^[a-z0-9]+(?:\.[a-z0-9-]+)+\/[a-z0-9][a-z0-9._-]*$/)
    .describe(
      "The type, in this module's own namespace: `<module id>/<name>`, e.g. tv.kroma.torrents/download.completed. It is what a reader mutes in their settings.",
    ),
  category: z
    .enum(['requests', 'media', 'reports', 'downloads', 'system'])
    .describe(
      "The preference category it is listed under. A reader's category switch moves it while they have not chosen for the type.",
    ),
  push: z
    .boolean()
    .nullish()
    .describe('Whether it reaches a device before its reader has chosen for it. Defaults to true.'),
  titleKey: MessageKey.describe("The title's key in this module's locales/<code>.json."),
  bodyKey: MessageKey.describe("The body's key in this module's locales/<code>.json."),
  labelKey: MessageKey.nullish().describe(
    "What a reader's settings call the type. Defaults to the title, which suits a title with no {param} in it.",
  ),
});
export type NotificationType = z.infer<typeof NotificationType>;

/** The first declared type outside `id`'s own namespace, or the first name
 * declared twice, worded for the module's author; `null` when there is none. */
export function notificationsProblem(
  id: string,
  declared: readonly Pick<NotificationType, 'type'>[],
): string | null {
  const seen = new Set<string>();
  for (const { type } of declared) {
    if (!type.startsWith(`${id}/`)) {
      return `notifications: "${type}" is not in this module's namespace (write ${id}/<name>)`;
    }
    if (seen.has(type)) return `notifications: "${type}" is declared twice`;
    seen.add(type);
  }
  return null;
}
