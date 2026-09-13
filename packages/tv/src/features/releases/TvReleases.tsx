import type { Release } from '@kromatv/client/releases';
import { formatDay } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { useLocale, useT } from '@kromatv/ui';
import { Box, Text, useFocusNav } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useNav } from '#tv/app/router';
import { BrandBar } from '#tv/features/releases/BrandBar';
import { HintStrip, KeyHint } from '#tv/features/releases/HintStrip';
import { ReleasePane } from '#tv/features/releases/ReleasePane';
import { ReleaseRowList } from '#tv/features/releases/ReleaseRowList';
import { releaseRows } from '#tv/features/releases/releaseRows';
import { useReleases } from '#tv/features/releases/useReleases';
import { VersionPicker } from '#tv/features/releases/VersionPicker';
import { RADIAL_GROUND } from '#tv/shared/ui';

interface Picked {
  version: number;
  row: number;
}

export function TvReleases() {
  const nav = useNav();
  const t = useT();
  const locale = useLocale();
  const view = useReleases();
  const [picked, setPicked] = useState<Picked>({ version: 0, row: 0 });
  useFocusNav({ onBack: nav.back });

  const releases = view?.releases ?? [];
  const release = releases[picked.version];
  const rows = release ? releaseRows(release) : [];
  const row = rows[picked.row];

  const pickVersion = (version: number) =>
    setPicked((current) => (current.version === version ? current : { version, row: 0 }));
  const pickRow = (at: number) =>
    setPicked((current) => (current.row === at ? current : { ...current, row: at }));

  return (
    <Box fill overflow="hidden" style={RADIAL_GROUND}>
      <BrandBar />
      {view && releases.length === 0 ? (
        <Box absolute left={64} top={190}>
          <Text variant="bodyTv" color="textDim">
            {t('releases.empty')}
          </Text>
        </Box>
      ) : null}

      {release ? (
        <>
          <VersionPicker releases={releases} picked={picked.version} onPick={pickVersion} />
          <Box absolute left={64} top={190} w={700}>
            <ReleaseHeading release={release} date={formatDay(release.date, locale)} />
            <ReleaseRowList rows={rows} picked={picked.row} onPick={pickRow} />
          </Box>
          {row ? <ReleasePane row={row} /> : null}
        </>
      ) : null}

      <HintStrip>
        <KeyHint keys="{left}{right}" label={t('releases.hintVersion')} />
        <KeyHint keys="{up}{down}" label={t('releases.hintBrowse')} />
        <KeyHint keys="{back}" label={t('common.back')} />
      </HintStrip>
    </Box>
  );
}

function ReleaseHeading({ release, date }: Readonly<{ release: Release; date: string | null }>) {
  const t = useT();
  const summary = releaseSummary(release, t);
  return (
    <>
      {date ? (
        <Text variant="overlineTv" color="accentText">
          {date}
        </Text>
      ) : null}
      <Text variant="bannerTv" mt={14}>
        {t('releases.version', { version: release.version })}
      </Text>
      {summary ? (
        <Text variant="labelTv" color="textMuted" mt={14}>
          {summary}
        </Text>
      ) : null}
    </>
  );
}

function releaseSummary(release: Release, t: Translate): string {
  const parts: string[] = [];
  if (release.highlights.length > 0) {
    parts.push(t('releases.highlightCount', { count: release.highlights.length }));
  }
  if (release.fixed.length > 0) {
    parts.push(t('releases.fixCount', { count: release.fixed.length }));
  }
  return parts.join(' · ');
}
