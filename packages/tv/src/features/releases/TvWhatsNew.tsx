import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  colors,
  FocusRegion,
  MediaCard,
  RAIL_GAP,
  Rail,
  styles,
  Text,
  useFocusNav,
} from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';
import { useClient, useNav } from '#tv/app/router';
import { BrandBar } from '#tv/features/releases/BrandBar';
import { HighlightCard } from '#tv/features/releases/HighlightCard';
import { HintStrip, KeyHint, OkHint } from '#tv/features/releases/HintStrip';
import { useReleases } from '#tv/features/releases/useReleases';
import { nextStep, whatsNewRelease } from '#tv/features/releases/whatsNew';
import { RADIAL_GROUND } from '#tv/shared/ui';

const ART = { left: 856, top: 150, width: 1000 };
const TILE = { width: 342, height: 192 };
const TILE_TINT = [colors.surface2, colors.surface1] as const;
const RAIL_BOTTOM = 100;

const s = styles({ actions: { row: true, gap: 18, mt: 34 } });

/** Opening it marks the unseen release seen. */
export function TvWhatsNew() {
  const nav = useNav();
  const client = useClient();
  const t = useT();
  const view = useReleases();
  const [index, setIndex] = useState(0);
  useFocusNav({ onBack: nav.back });

  const unseen = view?.unseen ?? null;
  useEffect(() => {
    if (unseen) client.releases.markSeen(unseen).catch(() => undefined);
  }, [client, unseen]);

  const release = view ? whatsNewRelease(view) : null;
  const highlights = release?.highlights ?? [];
  const highlight = highlights[index];
  const step = nextStep(index, highlights.length);

  const advance = () => {
    if (step.kind === 'close') nav.back();
    else setIndex(step.index);
  };

  return (
    <Box fill overflow="hidden" style={RADIAL_GROUND}>
      <BrandBar />
      {release && highlight ? (
        <>
          <Box absolute left={64} top={190} w={720}>
            <Text variant="overlineTv" color="accentText">
              {`${t('releases.title')} · ${t('releases.version', { version: release.version })}`}
            </Text>
            <Text variant="bannerTv" mt={14}>
              {highlight.title}
            </Text>
            <Text variant="bodyTv" color="text/82" maxW={660} mt={22}>
              {highlight.body}
            </Text>
            <FocusRegion style={s.actions}>
              <Button
                size="tv"
                autoFocus
                label={t(step.kind === 'close' ? 'releases.done' : 'common.next')}
                onPress={advance}
              />
              <Button
                size="tv"
                variant="outline"
                label={t('releases.allVersions')}
                onPress={() => nav.swap('releases')}
              />
            </FocusRegion>
          </Box>

          <Box absolute left={ART.left} top={ART.top}>
            <HighlightCard highlight={highlight} width={ART.width} />
          </Box>

          <Box absolute left={0} right={0} bottom={RAIL_BOTTOM}>
            <Rail.Root>
              <Rail.Title variant="subheadingTv">{t('releases.inThisVersion')}</Rail.Title>
              <Rail.List pitch={TILE.width + RAIL_GAP} height={TILE.height}>
                {highlights.map((item, at) => (
                  <MediaCard
                    key={item.title}
                    title={item.title}
                    overline={t('releases.step', { index: at + 1, count: highlights.length })}
                    art={item.image?.url ?? null}
                    tint={TILE_TINT}
                    onFocus={() => setIndex(at)}
                    onPress={() => setIndex(at)}
                  />
                ))}
              </Rail.List>
            </Rail.Root>
          </Box>
        </>
      ) : null}

      <HintStrip>
        <KeyHint keys="{left}{right}" label={t('releases.hintBrowse')} />
        <OkHint label={t('releases.hintSelect')} />
        <KeyHint keys="{back}" label={t('releases.hintClose')} />
      </HintStrip>
    </Box>
  );
}
