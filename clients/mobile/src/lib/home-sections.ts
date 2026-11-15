import type { KromaClient } from '@kromatv/client';
import type { CardSection, SectionLayout, SectionLayoutRequest } from '@kromatv/client/media';
import type { TitleFilter } from './homeFilter';

/** One title of the home as the card feed serves it. Every `SectionItem` is
 *  one too, so the featured pick of an older server reads the same way. */
export type HomeEntry = CardSection['items'][number];

/** Every layout this app draws, as it names them to the server. */
export const HOME_LAYOUTS: readonly SectionLayoutRequest[] = [
  'hero',
  'spotlight',
  'ranked',
  'wide',
];

const MY_LIST_SECTION = 'my-list';

/** A title of a row and what the server says of it. `rank` is where the server
 *  placed it in its section, from 1: a filter drops entries without
 *  renumbering the ones it keeps. */
export interface RowEntry {
  entry: HomeEntry;
  rank: number;
  note: string | null;
}

/** One section of the home, narrowed to what the filter leaves of it. */
export interface HomeRow {
  id: string;
  title: string;
  reason: string | null;
  layout: SectionLayout;
  entries: RowEntry[];
}

interface HomePlan {
  hero: HomeRow | null;
  rows: HomeRow[];
}

export function entryId(entry: HomeEntry): string {
  return entry.type === 'movie' ? entry.item.id : entry.show.id;
}

/** The name a title is shown under: the catalogue's, else the one the file gave it. */
export function entryTitle(entry: HomeEntry): string {
  const title = entry.type === 'movie' ? entry.item : entry.show;
  return title.metadata?.title ?? title.title;
}

/** The art a title is drawn on at 16:9: its backdrop, else its poster. */
export function entryBackdrop(entry: HomeEntry, client: KromaClient): string {
  const { artwork } = client.media;
  if (entry.type === 'movie') {
    return artwork.backdropFor(entry.item) ?? artwork.posterFor(entry.item);
  }
  return artwork.backdropFor(entry.show) ?? artwork.showPosterFor(entry.show);
}

/** The page a tap on a title opens. */
export function entryRoute(entry: HomeEntry): string {
  return entry.type === 'movie' ? `/item/${entry.item.id}` : `/show/${entry.show.id}`;
}

const passes = (entry: HomeEntry, filter: TitleFilter) => filter === null || entry.type === filter;

function narrowed(section: CardSection, filter: TitleFilter): HomeRow {
  const entries = section.items
    .map((entry, index) => ({
      entry,
      rank: index + 1,
      note: section.notes[entryId(entry)] ?? null,
    }))
    .filter(({ entry }) => passes(entry, filter));
  return {
    id: section.id,
    title: section.title,
    reason: section.reason ?? null,
    layout: section.layout,
    entries,
  };
}

/** The home under a filter: `hero` is the first hero section the filter leaves
 *  a title in, `rows` everything else in the server's order. A section the
 *  filter empties is left out whatever its layout. */
export function planHome(sections: readonly CardSection[], filter: TitleFilter): HomePlan {
  const drawn = sections
    .map((section) => narrowed(section, filter))
    .filter((row) => row.entries.length > 0);
  const hero = drawn.find((row) => row.layout === 'hero') ?? null;
  return { hero, rows: drawn.filter((row) => row !== hero) };
}

/** Whether the server composed what the page opens on. An older server sends
 *  no hero section, and the single featured title stands in for it. */
export function servesHero(sections: readonly CardSection[]): boolean {
  return sections.some((section) => section.layout === 'hero');
}

/** What an older server's home opens on: its one featured title, unless the
 *  filter is for the other type. */
export function featuredFallback(
  pick: HomeEntry | null | undefined,
  filter: TitleFilter,
): HomeEntry | null {
  return pick && passes(pick, filter) ? pick : null;
}

/** Whether the saved titles are this app's to assemble: only for a server that
 *  sends no section of them, a filter emptying that section notwithstanding. */
export function drawsClientMyList(sections: readonly CardSection[]): boolean {
  return sections.every((section) => section.id !== MY_LIST_SECTION);
}
