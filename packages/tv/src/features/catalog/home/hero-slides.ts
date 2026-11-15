import type { KromaClient } from '@kromatv/client';
import type { CardSection, MediaCard } from '@kromatv/client/media';
import { qualityBadgeForVideo } from '@kromatv/core';
import { entryBackdrop, entryId, type HomeEntry } from '#tv/features/catalog/home/sectionEntry';

// The hero fills the 1920 stage, but a backdrop master is a TMDB w1280, so
// there is nothing sharper to ask for.
const HERO_W = 1280;

export interface HeroSlide {
  entry: HomeEntry;
  backdrop: string;
  badge: string | null;
  note: string | null;
}

interface HeroSource {
  sections: readonly CardSection[];
  featured: HomeEntry | null;
  movies: readonly MediaCard[];
}

function slideOf(entry: HomeEntry, note: string | undefined, client: KromaClient): HeroSlide {
  return {
    entry,
    backdrop: entryBackdrop(entry, client, HERO_W),
    badge: qualityBadgeForVideo(entry.type === 'show' ? entry.show.video : entry.item.video),
    note: note ?? null,
  };
}

/** What the home opens on: the server's hero section, each entry with the note
 * saying why it is there. Without one, the featured pick stands in, then the
 * top section's first entry, then the first catalogue movie. */
export function heroSlides(
  { sections, featured, movies }: HeroSource,
  client: KromaClient,
): HeroSlide[] {
  const hero = sections.find((section) => section.layout === 'hero');
  if (hero?.items.length) {
    return hero.items.map((entry) => slideOf(entry, hero.notes[entryId(entry)], client));
  }
  const first = movies[0];
  const standIn: HomeEntry | null =
    featured ?? sections[0]?.items[0] ?? (first ? { type: 'movie', item: first } : null);
  return standIn ? [slideOf(standIn, undefined, client)] : [];
}
