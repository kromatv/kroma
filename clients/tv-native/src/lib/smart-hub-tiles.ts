import type { PreviewSection, PreviewTile } from '@kromatv/react-native-tizen/preview-json';
import { z } from 'zod';

const MAX_TILES = 40;
const MAX_CONTINUE_TILES = 20;

const continueSchema = z.array(
  z.object({
    id: z.string().min(1),
    title: z.string(),
    subtitle: z.string().optional(),
    imageUrl: z.string().optional(),
    kind: z.string(),
    showId: z.string().optional(),
  }),
);

const channelsSchema = z.array(
  z.object({
    title: z.string(),
    items: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string(),
        subtitle: z.string().optional(),
        imageUrl: z.string().optional(),
      }),
    ),
  }),
);

function parsed<T>(schema: z.ZodType<T>, json: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(json));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function link(type: 'item' | 'show', id: string): string {
  return `kroma://${type}/${encodeURIComponent(id)}`;
}

function tile(
  item: { title: string; subtitle?: string; imageUrl?: string },
  url: string,
  playable: boolean,
): PreviewTile | null {
  if (!item.imageUrl || !/^https?:\/\//.test(item.imageUrl)) return null;
  return {
    ...(item.title ? { title: item.title } : {}),
    ...(item.subtitle ? { subtitle: item.subtitle } : {}),
    image: item.imageUrl,
    ratio: '16:9',
    url,
    playable,
  };
}

/** KROMA's launcher rows as Smart Hub sections: "continue watching" first, then
 *  the first home channel (the newest titles), each tile a `kroma://` link the
 *  app already routes, at most Samsung's 40 tiles and never one link twice. */
export function smartHubSections(
  continueJson: string,
  channelsJson: string,
  continueTitle: string,
): PreviewSection[] {
  const seen = new Set<string>();
  const unique = (candidate: PreviewTile | null, limit: number): candidate is PreviewTile => {
    if (candidate === null || seen.has(candidate.url) || seen.size >= limit) return false;
    seen.add(candidate.url);
    return true;
  };
  const resume = (parsed(continueSchema, continueJson) ?? [])
    .map((item) =>
      tile(
        item,
        item.kind === 'episode' && item.showId ? link('show', item.showId) : link('item', item.id),
        true,
      ),
    )
    .filter((candidate) => unique(candidate, MAX_CONTINUE_TILES));
  const [newest] = parsed(channelsSchema, channelsJson) ?? [];
  const added = (newest?.items ?? [])
    .map((item) => tile(item, link('item', item.id), false))
    .filter((candidate) => unique(candidate, MAX_TILES));
  return [
    ...(resume.length > 0 ? [{ title: continueTitle, tiles: resume }] : []),
    ...(newest && added.length > 0 ? [{ title: newest.title, tiles: added }] : []),
  ];
}
