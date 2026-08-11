// Connect a device: two roads to the same place, and the reader picks which.
//
// - `network` (<NearbyTvs>): the televisions waiting on this network, one tap
//   each. Asks nothing of anybody, and is therefore first.
// - `scan` (<ScanCode>): the road that works from anywhere - across subnets,
//   from cellular, from a television that cannot be heard.
//
// This file is the chrome and the switch, and nothing else: each mode owns its
// own state, because neither has anything the other wants. A segmented control
// rather than one long page, because stacked they put a viewfinder, a pad and a
// list of televisions inside the same 700 points and only the tallest phone
// reached the bottom. One mode is mounted at a time, so the camera never runs
// behind the list it is not in.
//
// Worn as a SETTINGS page - <Screen> + <PageHeader> - not as an onboarding
// gate: it is reached from settings, and the gate scaffold spent a lockup, a
// 28pt headline and 48pt of margin saying what a nav bar says in one line.
//
// The same televisions also appear in the cast picker (<CastDeviceList>), which
// is where somebody already choosing a screen will look for them.

import { Box, Icon, SegmentedControl, styles, Txt } from '@kroma/ui/kit';
import { useState } from 'react';
import { NearbyTvs } from '#mobile/components/connect/NearbyTvs';
import { ScanCode } from '#mobile/components/connect/ScanCode';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { spacing, type } from '#mobile/lib/theme';

// `network` leads because it is the one that asks nothing of the reader.
const MODES = ['network', 'scan'] as const;
type ConnectMode = (typeof MODES)[number];

export default function ConnectDevice() {
  const t = useT();
  const [mode, setMode] = useState<ConnectMode>(MODES[0]);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Screen padded={false}>
        <PageHeader title={t('connect.title')} />
        <Box style={s.done}>
          <Box style={s.doneBadge}>
            <Icon name="check" size={34} stroke={2.4} color="accentInk" />
          </Box>
          <Txt style={s.doneTitle}>{t('connect.connected')}</Txt>
          <Txt style={s.modeDesc}>{t('connect.willConnectSoon')}</Txt>
        </Box>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <PageHeader title={t('connect.title')} />
      <Box style={s.body}>
        <SegmentedControl.Root
          value={mode}
          onValueChange={setMode}
          label={t('connect.title')}
          options={MODES.map((m) => ({ value: m, label: t(`connect.mode.${m}`) }))}
          stretch
        />

        {/* Under the control, because it describes the mode the control just
            selected. Above it, it read as a description of the title. */}
        <Txt style={s.modeDesc}>
          {mode === 'network' ? t('handoff.nearbySub') : t('connect.scanOrType')}
        </Txt>

        {mode === 'network' ? <NearbyTvs /> : <ScanCode onConnected={() => setDone(true)} />}
      </Box>
    </Screen>
  );
}

const s = styles({
  body: { flex: true, px: spacing.md, gap: spacing.md },
  done: { flex: true, center: true, gap: spacing.md, px: spacing.lg },
  doneTitle: { ...type.title, fontSize: 20, textAlign: 'center' },
  doneBadge: { center: true, w: 72, h: 72, bg: 'accent', radius: 36 },
  modeDesc: { ...type.caption, color: 'textDim', textAlign: 'center', mt: 2, mb: spacing.sm },
});
