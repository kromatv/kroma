import type { Section, SectionItem } from '@kroma/core';
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
import { buildHomeChannels } from '#tv/shared/launcher/cards';

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
    const json = JSON.stringify(buildHomeChannels(sections, client));
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
