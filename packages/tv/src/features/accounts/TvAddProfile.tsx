import { normalizeServerUrl as norm } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, FocusColumn, Hint, Spinner, styles, Txt, useFocusNav } from '@kroma/ui/kit';
import { useEffect, useMemo } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useNav } from '#tv/app/router';
import { useServersHealth } from '#tv/app/useServersHealth';
import { ActionRow, ServerRow, ServerRowSkeleton } from '#tv/features/accounts/ServerRow';
import { AuthScreen, hostOf } from '#tv/shared/ui';

interface Entry {
  url: string;
  fallbackName: string;
  savedName?: string | null;
  address: string;
  isNew: boolean;
}

function addrOf(url: string): string {
  try {
    const u = new URL(url);
    return u.port ? `${u.hostname} · port ${u.port}` : u.hostname;
  } catch {
    return url;
  }
}

/**
 * Add-profile wizard, step 1: choose a server. Every listed server is polled
 * on its public `/api/health` so a row states what it is and whether it
 * answers before you commit to it. Picking one advances to Quick Connect.
 */
export function TvAddProfile() {
  const nav = useNav();
  const t = useT();
  const { servers, discovered, discovering, discover, addServer } = useConnection();
  useFocusNav({ onBack: nav.back, resetKey: discovered.length + servers.length });

  // Kick off (or refresh) LAN discovery when the wizard opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on open.
  useEffect(() => discover(), []);

  const entries = useMemo<Entry[]>(() => {
    const localUrls = discovered.map((u) => norm(u));
    const of = (url: string, saved?: { name?: string | null }, isNew = false): Entry => ({
      url,
      fallbackName: saved?.name || (hostOf(url) ?? url),
      savedName: saved?.name,
      address: addrOf(url),
      isNew,
    });
    const out = localUrls.map((url) => {
      const saved = servers.find((entry) => entry.url === url);
      return of(url, saved, !saved);
    });
    for (const other of servers.filter((entry) => !localUrls.includes(entry.url)))
      out.push(of(other.url, other));
    return out;
  }, [discovered, servers]);

  const health = useServersHealth(entries.map((e) => e.url));

  const pick = (url: string, name?: string | null) => {
    addServer(url, name);
    nav.go('quick');
  };

  return (
    <AuthScreen>
      <Box w="100%" maxW={720}>
        <Txt
          variant="h1"
          style={{ fontSize: 40, fontWeight: '600', textAlign: 'center', marginBottom: 6 }}
        >
          {t('addProfile.title')}
        </Txt>
        <Txt
          style={{ fontSize: 16, fontWeight: '500', textAlign: 'center', marginBottom: 36 }}
          color="textDim"
        >
          {t('addProfile.subtitle')}
        </Txt>

        <Box row align="center" gap={10} mb={12}>
          <Txt variant="overlineTv" style={s.section} color="rgba(244, 243, 240, 0.42)">
            {t('addProfile.availableServers')}
          </Txt>
          {discovering ? <Spinner size={13} thickness={2} /> : null}
        </Box>
        <Box gap={12}>
          {/* The navigator orders a group's children by registration order, not
              position, so this group holds the servers' place above "Ajouter
              manuellement" — keys are list positions for the same reason. */}
          <FocusColumn style={s.list}>
            {entries.map((e, index) => {
              const probe = health[e.url];
              return (
                <ServerRow
                  // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the identity here - it is the slot in the list, and the navigator registers by mount order.
                  key={index}
                  address={e.address}
                  fallbackName={e.fallbackName}
                  isNew={e.isNew}
                  probe={probe}
                  autoFocus={index === 0}
                  onPress={() => pick(e.url, probe?.name ?? e.savedName)}
                />
              );
            })}
            {entries.length === 0 && discovering ? <ServerRowSkeleton /> : null}
          </FocusColumn>
          <ActionRow
            icon="plus"
            title={t('addProfile.addManually')}
            sub={t('addProfile.addManuallySub')}
            autoFocus={entries.length === 0}
            onPress={() => nav.go('connect')}
          />
        </Box>

        <Hint
          text={t('addProfile.navHint')}
          size={14}
          gap={4}
          justify="center"
          mt={28}
          color="rgba(244, 243, 240, 0.4)"
          textStyle={{ fontWeight: '500' }}
        />
      </Box>
    </AuthScreen>
  );
}

const s = styles({
  list: { gap: 12 },
  section: { fontSize: 12 },
});
