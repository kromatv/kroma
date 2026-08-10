import type { KromaClient, MediaItem, Section, SectionItem } from '@kroma/core';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { launcherBackend } from '#tv/app/launcher';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';

type HomeProgram = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  backdropUrl?: string;
  kind: string;
};
// The launcher backend keys each channel by its ROW INDEX (see HomeChannel.kt),
// so the section id is not sent - only the display title + its programs.
type HomeChannelSpec = { title: string; items: HomeProgram[] };

// Only the evergreen rows are mirrored: the personalized/themed rows `/api/home`
// also returns make unstable launcher channels. Their server ids are fixed (see
// services/sections build_home).
const GENERIC_HOME_ROWS = ['recent', 'for-you', 'trending'] as const;

const MAX_PROGRAMS = 20;

// A launcher card is drawn 1280 wide; asking for the original ships a
// multi-megabyte still to a shelf that shows a thumbnail.
const LAUNCHER_ART_W = 1280;

function toProgram(movie: MediaItem, client: KromaClient): HomeProgram {
  const art = `${client.baseUrl}/api/items/${encodeURIComponent(movie.id)}/card?v=${encodeURIComponent(movie.addedAt)}`;
  return {
    id: movie.id,
    title: movie.title,
    subtitle: movie.year ? String(movie.year) : '',
    imageUrl: art,
    backdropUrl: client.backdropFor(movie, LAUNCHER_ART_W) ?? undefined,
    kind: 'movie',
  };
}

// Movies only: the launcher preview deep link resolves a movie id.
function programsOf(section: Section, client: KromaClient): HomeProgram[] {
  const seen = new Set<string>();
  const items: HomeProgram[] = [];
  for (const e of section.items) {
    if (e.type !== 'movie' || seen.has(e.item.id)) continue;
    seen.add(e.item.id);
    items.push(toProgram(e.item, client));
    if (items.length >= MAX_PROGRAMS) break;
  }
  return items;
}

function toHomeChannels(sections: Section[], client: KromaClient): HomeChannelSpec[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const channels: HomeChannelSpec[] = [];
  for (const id of GENERIC_HOME_ROWS) {
    const s = byId.get(id);
    if (!s) continue;
    const items = programsOf(s, client);
    if (items.length) channels.push({ title: s.title, items });
  }
  // A server that renamed those ids would silently publish nothing.
  if (!channels.length && sections.length) {
    console.warn('[KROMA] no generic home rows matched section ids', GENERIC_HOME_ROWS);
  }
  return channels;
}

interface Recommend {
  sections: Section[];
  featured: SectionItem | null;
}

const Ctx = createContext<Recommend | null>(null);

/** Bearer-scoped, so it must be mounted inside auth + connection; stays empty
 * until there is a session and a reachable server. */
export function RecommendProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  const { client } = useConnection();
  const [sections, setSections] = useState<Section[]>([]);
  const [featured, setFeatured] = useState<SectionItem | null>(null);

  useEffect(() => {
    if (!user || !client) {
      setSections([]);
      setFeatured(null);
      return;
    }
    let cancelled = false;
    client
      .home()
      .then((s) => {
        if (!cancelled) setSections(s);
      })
      .catch(() => undefined);
    client
      .featured()
      .then((f) => {
        if (!cancelled) setFeatured(f);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, client]);

  // Mirror the rows into the Android TV / Google TV launcher home, guarded on the
  // serialized payload so render churn does not re-push. No-op without a backend.
  const lastPushed = useRef<string>('');
  useEffect(() => {
    const launcher = launcherBackend();
    if (!launcher || !client) return;
    const json = JSON.stringify(toHomeChannels(sections, client));
    if (json === lastPushed.current) return;
    // An empty push is only meaningful as a clear after something was published.
    if (json === '[]' && lastPushed.current === '') return;
    lastPushed.current = json;
    launcher.setHomeChannel(json);
  }, [sections, client]);

  const value = useMemo<Recommend>(() => ({ sections, featured }), [sections, featured]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRecommend(): Recommend {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRecommend() must be used inside <RecommendProvider>');
  return c;
}
