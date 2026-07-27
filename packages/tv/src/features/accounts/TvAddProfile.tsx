import { normalizeServerUrl as norm } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, FocusColumn, Hint, Spinner, Txt, useFocusNav } from '@kroma/ui/kit';
import { useEffect, useMemo } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useNav } from '#tv/app/router';
import { useServersHealth } from '#tv/app/useServersHealth';
import { ActionRow, ServerRow, ServerRowSkeleton } from '#tv/features/accounts/ServerRow';
import { AuthScreen, hostOf } from '#tv/shared/ui';

interface Entry {
  url: string;
  /** Name to show until the server states its own (saved label, else host). */
  fallbackName: string;
  /** The label this server was saved under, if it is saved at all. */
  savedName?: string | null;
  address: string;
  /** Discovered on the LAN but not saved yet. */
  isNew: boolean;
}

/** "host" or "host · port N" for a server URL. */
function addrOf(url: string): string {
  try {
    const u = new URL(url);
    return u.port ? `${u.hostname} · port ${u.port}` : u.hostname;
  } catch {
    return url;
  }
}

/**
 * Add-profile wizard, step 1 choose a server. One "Serveurs disponibles" list
 * (LAN-discovered + saved, with a discovery spinner) followed by "Ajouter
 * manuellement". Every listed server is polled on its public `/api/health`, so a
 * row states what it is (name, version, catalogue size) and whether it answers
 * before you commit to it. Picking one points the client at it and advances to
 * Quick Connect. The wizard never offers a password or registration.
 */
export function TvAddProfile() {
  const nav = useNav();
  const t = useT();
  const { servers, discovered, discovering, discover, addServer } = useConnection();
  useFocusNav({ onBack: nav.back, resetKey: discovered.length + servers.length });

  // Kick off (or refresh) LAN discovery when the wizard opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on open.
  useEffect(() => discover(), []);

  // A single "Serveurs disponibles" section: discovered servers first (tagged
  // "nouveau" when not yet saved), then any saved-but-not-discovered.
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
      const saved = servers.find((s) => s.url === url);
      return of(url, saved, !saved);
    });
    for (const s of servers.filter((sv) => !localUrls.includes(sv.url))) out.push(of(s.url, s));
    return out;
  }, [discovered, servers]);

  // Probe each listed server so a row shows whether it actually answers (a saved
  // server can be offline; a freshly discovered one is reachable but confirmed
  // here) and what it is. Public endpoint: no session needed.
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
          <Txt variant="overlineTv" style={SECTION} color="rgba(244, 243, 240, 0.42)">
            {t('addProfile.availableServers')}
          </Txt>
          {discovering ? <Spinner size={13} thickness={2} /> : null}
        </Box>
        <Box gap={12}>
          {/* The servers get a group of their own, mounted whether or not any
              server is known yet. The navigator orders a group's children by the
              order they REGISTERED, not by where they sit, so a server found by
              discovery a second later would otherwise register behind "Ajouter
              manuellement" and Down would walk past that row forever. This group
              holds their place above it; the keys are POSITIONS for the same
              reason (a server prepended to the list must not register last). */}
          <FocusColumn style={LIST}>
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
                  // The health answer is the freshest name the server has, so a
                  // renamed server is saved under its new label, not the old one.
                  onPress={() => pick(e.url, probe?.name ?? e.savedName)}
                />
              );
            })}
            {/* Nothing found YET: show the shape of a row rather than a gap. */}
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

const LIST = { gap: 12 };

/** A size down from the kit role: this list sits inside a dialog-width column. */
const SECTION = { fontSize: 12 };
