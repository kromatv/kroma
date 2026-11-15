import type { CardSection, SectionItem, SectionLayoutRequest } from '@kromatv/client/media';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLauncherBackend } from '#tv/app/launcher';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { buildHomeChannels } from '#tv/shared/launcher/cards';

const DRAWN_LAYOUTS: readonly SectionLayoutRequest[] = ['hero', 'spotlight', 'ranked', 'wide'];

interface Recommend {
  sections: CardSection[];
  featured: SectionItem | null;
}

const Ctx = createContext<Recommend | null>(null);

/** Bearer-scoped, so it must be mounted inside auth + connection; stays empty
 * until there is a session and a reachable server. */
export function RecommendProvider({ children }: Readonly<{ children: ReactNode }>) {
  const launcher = useLauncherBackend();
  const { user, ready } = useAuth();
  const { client } = useConnection();
  const [sections, setSections] = useState<CardSection[]>([]);
  const [featured, setFeatured] = useState<SectionItem | null>(null);

  const active = ready && !!user && !!client;
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) {
      setSections([]);
      setFeatured(null);
    }
  }

  useEffect(() => {
    if (!ready || !user || !client) return;
    let cancelled = false;
    client.media
      .homeCards({ layouts: DRAWN_LAYOUTS })
      .then((home) => {
        if (cancelled) return;
        setSections(home);
        if (home.some((section) => section.layout === 'hero')) return null;
        return client.media.featured();
      })
      .then((pick) => {
        if (!cancelled && pick) setFeatured(pick);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, user, client]);

  // Mirror the rows into the Android TV / Google TV launcher home, guarded on the
  // serialized payload so render churn does not re-push. No-op without a backend.
  const lastPushed = useRef<{ backend: typeof launcher; json: string } | null>(null);
  useEffect(() => {
    if (!launcher || !client) return;
    const json = JSON.stringify(buildHomeChannels(sections, client));
    if (lastPushed.current?.backend === launcher && json === lastPushed.current.json) return;
    // An empty push is only meaningful as a clear after something was published.
    if (json === '[]' && lastPushed.current === null) return;
    lastPushed.current = { backend: launcher, json };
    launcher.setHomeChannel(json);
  }, [sections, client, launcher]);

  const value = useMemo<Recommend>(() => ({ sections, featured }), [sections, featured]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRecommend(): Recommend {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRecommend() must be used inside <RecommendProvider>');
  return c;
}
