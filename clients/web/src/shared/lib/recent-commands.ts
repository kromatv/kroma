import type { CommandItem, IconName } from '@kromatv/ui/kit';
import { hasGlyph } from '@kromatv/ui/kit';
import { z } from 'zod';
import type { CommandDef } from '#web/shared/lib/command-menu';
import type { RoutePath } from '#web/shared/ui/route-link';

const LIMIT = 5;
const TICKET = /[?&]t=/;

const Recent = z.object({
  id: z.string(),
  label: z.string(),
  to: z.string(),
  params: z.record(z.string(), z.string()).optional(),
  search: z.record(z.string(), z.unknown()).optional(),
  hash: z.string().optional(),
  subtitle: z.string().optional(),
  icon: z.string().refine(hasGlyph).optional(),
  image: z.string().optional(),
});

/** A place the viewer went through the command menu. */
export type RecentCommand = z.infer<typeof Recent>;

const keyOf = (userId: string) => `kroma:command-menu:recent:${userId}`;

/** Where this viewer last went through the menu on this device, latest first. */
export function readRecentCommands(userId: string): RecentCommand[] {
  try {
    const parsed = z
      .array(Recent)
      .safeParse(JSON.parse(localStorage.getItem(keyOf(userId)) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Remembers a row the viewer chose, if it is a place. A row that does something is
 *  never remembered, because it would sit first in the list, one Enter from running
 *  again. A plain route with a `search` holds one moment's query, not a place, whereas
 *  a title's is part of where it goes. A row with both `params` and a capability is
 *  left out too: it would be restored, unchecked, for a viewer who may have lost it. Artwork
 *  behind a media ticket is left out, since a ticket is never written to storage. */
export function rememberCommand(userId: string, id: string, command: CommandDef): void {
  if (!command.to || (command.search && !command.params) || (command.params && command.cap)) {
    return;
  }
  const { label, to, params, search, hash, subtitle, icon, image } = command;
  const portable = image && !TICKET.test(image) ? image : undefined;
  const entry: RecentCommand = {
    id,
    label,
    to,
    params,
    search,
    hash,
    subtitle,
    icon,
    image: portable,
  };
  const kept = readRecentCommands(userId).filter((recent) => recent.id !== id);
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify([entry, ...kept].slice(0, LIMIT)));
  } catch {
    return;
  }
}

/** The titles among them, as rows: a title is only in the menu while a search finds
 *  it, so it has to come back from what was remembered. A plain page is not restored,
 *  because the viewer may no longer be allowed it, and nor is anything `live` already
 *  lists under that name, since two rows would say the same thing. */
export function restoredCommands(
  recent: readonly RecentCommand[],
  group: string,
  live: readonly CommandDef[],
): readonly CommandDef[] {
  const named = new Set(live.map(({ label }) => label));
  return recent.flatMap(({ id, label, to, params, search, hash, subtitle, icon, image }) =>
    params && !named.has(label)
      ? [
          {
            id,
            label,
            group,
            to: to as RoutePath,
            params,
            search,
            hash,
            subtitle,
            image,
            icon: icon as IconName | undefined,
          },
        ]
      : [],
  );
}

/** `items` with what the viewer went to recently lifted under `group`, below what the
 *  page itself offers. The page the viewer is on is left out: nobody goes back to it. */
export function recentFirst(
  items: readonly CommandItem[],
  recent: readonly RecentCommand[],
  { group, pageGroup, current }: { group: string; pageGroup: string; current: string | undefined },
): CommandItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const lifted = recent.flatMap(({ id }) => {
    const item = id === current ? undefined : byId.get(id);
    return item ? [{ ...item, group }] : [];
  });
  const liftedIds = new Set(lifted.map((item) => item.id));
  const rest = items.filter((item) => !liftedIds.has(item.id) && item.group !== group);
  return [
    ...rest.filter((item) => item.group === pageGroup),
    ...lifted,
    ...rest.filter((item) => item.group !== pageGroup),
  ];
}
