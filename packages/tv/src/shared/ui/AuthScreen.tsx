import { KromaClient, sizedImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  BackButton,
  Badge,
  Box,
  colors,
  FocusScroll,
  gradient,
  SplashBackdrop,
  type SplashCover,
  space,
  styles,
  Txt,
} from '@kroma/ui/kit';
import { memo, type ReactNode, useEffect, useMemo, useState } from 'react';
import { AUTH_SCREENS } from '#tv/app/navPolicy';
import { useConnectionMaybe } from '#tv/app/providers/connection';
import { useHandoffBeacon } from '#tv/app/providers/handoffBeacon';
import { type TvChrome, useNav } from '#tv/app/router';

// Wide enough to stay sharp on a 1080p panel under the veil, and the widest
// rendition the server makes. The kit's own home backdrop asks for the same.
const SPLASH_W = 960;

const BACKDROP = gradient(`radial-gradient(120% 90% at 50% 0%, #15131C, ${colors.bg} 68%)`);

/** The public `/api/splash` sample mapped for the kit's universal splash
 * backdrop, so the TV gate dresses like the web and phone ones. Empty until
 * the first server answers (or when it has no artwork), which keeps the
 * radial. */
function useSplashCovers(): SplashCover[] {
  const t = useT();
  const connection = useConnectionMaybe();
  // `/api/splash` is public and these screens run BEFORE a server is active,
  // so the art comes from whichever server this device knows: the active one
  // first, then the saved list, then whatever discovery just found.
  const urls = useMemo(() => {
    const all = [
      connection?.activeServerUrl,
      ...(connection?.servers ?? []).map((s) => s.url),
      ...(connection?.discovered ?? []),
    ];
    return [...new Set(all.filter((u): u is string => Boolean(u)))];
  }, [connection?.activeServerUrl, connection?.servers, connection?.discovered]);

  const [covers, setCovers] = useState<SplashCover[]>([]);
  useEffect(() => {
    let cancelled = false;
    // Each candidate in turn, stopping at the first that answers: a household
    // can hold a server too old to know this route, and it serves the SPA's
    // index.html for it rather than a 404, which is not artwork.
    void (async () => {
      for (const url of urls) {
        try {
          const entries = await new KromaClient({ baseUrl: url }).splash();
          if (cancelled) return;
          if (entries.length === 0) continue;
          setCovers(
            entries.map((e) => ({
              // <Img> never rewrites a URL, so the SIZE is the caller's to ask
              // for: unsized, a television decodes the full-width master for a
              // backdrop it then hides under a veil, and pays for that texture
              // again on every frame of the drift.
              url: sizedImageUrl(e.backdropUrl, SPLASH_W) ?? e.backdropUrl,
              caption: [e.title, e.year].filter(Boolean).join(' · '),
              eyebrow: t(e.kind === 'show' ? 'content.series' : 'content.film'),
            })),
          );
          return;
        } catch {
          /* try the next server */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urls, t]);
  return covers;
}

// ONE instance for the whole gate, mounted by the outlet rather than by each
// screen (see `TvChrome`). That is what makes the sign-in read as one room the
// viewer moves through: fetched once, so `/api/splash` - which answers with a
// fresh RANDOM sample every call - cannot deal a different cover on the next
// step, and its slideshow and pan keep running instead of restarting.
const GateBackdrop = memo(function GateBackdrop() {
  const covers = useSplashCovers();
  return (
    <Box fill style={BACKDROP}>
      <SplashBackdrop covers={covers} />
    </Box>
  );
});

/**
 * The routes that wear the gate's artwork: every screen built on
 * {@link AuthScreen}. Derived from the access table rather than hand-listed, so
 * a new signed-out screen cannot get the guard and silently lose the artwork -
 * `ACCESS` is exhaustive by type, a literal here would not be. The two extras
 * are the signed-in screens that still use {@link AuthScreen}.
 *
 * `under: true`: decorative, never a focus target. Handed to
 * `<TvNavProvider chrome={…}>`.
 */
export const AUTH_BACKDROP: TvChrome = {
  routes: [...AUTH_SCREENS, 'profileMenu', 'report'],
  render: GateBackdrop,
  under: true,
};

/** The shared centred scaffold for the TV auth / connect / pin screens: the
 * artwork is the outlet's (see {@link AUTH_BACKDROP}), so this brings only the
 * scroll, the pinned Back button - which self-hides at the signed-out root -
 * and the beacon this TV is waiting under, on whichever gate screen it is
 * showing. */
export function AuthScreen({ children }: Readonly<{ children: ReactNode }>) {
  const nav = useNav();
  const t = useT();
  return (
    <Box fill z={10}>
      {/* Before the scroll, not after it: this navigator has no geometry, so a
          control is where the TREE puts it. Drawn at the top-left but rendered
          last, the button was the last stop of the screen's vertical chain -
          reachable only by pressing Down past every row. First, it is one Up
          from the top of the content, which is where it looks like it is. It
          still does not open the screen: entry belongs to whichever control
          carries `autoFocus`. */}
      {nav.canGoBack ? (
        <Box absolute left={32} top={28} z={20}>
          <BackButton onPress={nav.back} label={t('common.back')} />
        </Box>
      ) : null}
      <FocusScroll style={s.scroll} contentStyle={s.content}>
        {children}
      </FocusScroll>
      <BeaconMark />
    </Box>
  );
}

// Nobody types the check string. It is printed so a person facing two
// televisions, or a device that named itself after theirs, can tell which row in
// the phone's list is this screen.
function BeaconMark() {
  const t = useT();
  const beacon = useHandoffBeacon();
  if (!beacon) return null;
  return (
    <Box style={s.beacon} pointerEvents="none">
      <Txt variant="label" color="textDim">
        {t('handoff.tvBeacon', { name: beacon.name })}
      </Txt>
      <Badge tone="neutral" size="tv">
        {t('handoff.tvCheck', { check: beacon.check })}
      </Badge>
    </Box>
  );
}

const s = styles({
  scroll: { flex: true },
  // Growth and centring sit on the content, not the box, so it centres when it
  // fits and scrolls from the top when it does not.
  content: { grow: 1, center: true, px: 40, py: 48 },
  beacon: {
    absolute: true,
    left: 0,
    right: 0,
    bottom: space[8],
    row: true,
    center: true,
    gap: space[3],
  },
});
