import { useT } from '@kromatv/ui';
import {
  BackButton,
  Box,
  FocusColumn,
  FocusRegion,
  Hint,
  shade,
  styles,
  useStyles,
  Veil,
} from '@kromatv/ui/kit';
import { type ReactNode, useState } from 'react';
import { groupAvailable } from '#tv/app/settings/groups';
import { useNav } from '#tv/app/router';
import { BeaconMark } from '#tv/shared/ui';
import { weight } from '#tv/shared/ui/weight';
import { PaneDetail } from './PaneDetail';
import { PaneRow } from './PaneRow';
import { type SettingsPane, paneId } from './panes';

const CALM = `linear-gradient(90deg, ${shade(0.97)} 0%, ${shade(0.93)} 38%, ${shade(0.88)} 100%)`;

interface SettingsPanesProps {
  /** Above the left pane's list: the profile, or the device's mark and title. */
  header: ReactNode;
  /** The left pane, section by section, with a gap between sections. */
  sections: readonly (readonly SettingsPane[])[];
}

function shown(pane: SettingsPane): boolean {
  if (pane.kind === 'group') return groupAvailable(pane.group);
  return !pane.available || pane.available();
}

/** The two-pane settings screen: groups and actions on the left, and on the
 * right the rows of whichever one holds the focus, reached with Right. */
export function SettingsPanes({ header, sections }: Readonly<SettingsPanesProps>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const nav = useNav();
  const visible = sections.map((section) => section.filter(shown)).filter((x) => x.length > 0);
  const panes = visible.flat();
  const [activeId, setActiveId] = useState(() => (panes[0] ? paneId(panes[0]) : ''));
  const active = panes.find((pane) => paneId(pane) === activeId) ?? panes[0];
  const entryId = panes[0] ? paneId(panes[0]) : '';

  return (
    <Box fill z={10}>
      <Veil ramp={CALM} />
      <FocusRegion style={s.screen}>
        <FocusColumn style={s.left}>
          {nav.canGoBack ? (
            <Box style={s.back}>
              <BackButton onPress={nav.back} label={t('common.back')} />
            </Box>
          ) : null}
          <Box style={s.header}>{header}</Box>
          {visible.map((section, index) => (
            <Box key={section.map(paneId).join()} style={index > 0 ? s.section : s.first}>
              {section.map((pane) => (
                <PaneRow
                  key={paneId(pane)}
                  pane={pane}
                  active={active !== undefined && paneId(active) === paneId(pane)}
                  entry={paneId(pane) === entryId}
                  onFocus={setActiveId}
                />
              ))}
            </Box>
          ))}
          <Hint
            text={t('profileMenu.navHint')}
            size={14}
            gap={4}
            mt={28}
            color="text/40"
            textStyle={weight.medium}
          />
        </FocusColumn>
        {active ? <PaneDetail pane={active} /> : null}
      </FocusRegion>
      <BeaconMark />
    </Box>
  );
}

const sDefinition = styles({
  screen: { flex: true, row: true },
  left: { w: '38%', pl: 96, pr: 40, pt: 56, pb: 48, bg: 'surface1' },
  back: { mb: 24, align: 'flex-start' },
  header: { mb: 32, minH: 72, justify: 'center' },
  first: { gap: 10 },
  section: { gap: 10, mt: 32 },
});
