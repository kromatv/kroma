import { useT } from '@kromatv/ui';
import {
  BackButton,
  Box,
  type FocusHandle,
  FocusColumn,
  FocusRegion,
  shade,
  styles,
  useFocusNav,
  useStyles,
  Veil,
} from '@kromatv/ui/kit';
import { type ReactNode, useRef, useState } from 'react';
import { groupAvailable } from '#tv/app/settings/groups';
import { useNav } from '#tv/app/router';
import { BeaconMark } from '#tv/shared/ui';
import { PaneDetail } from './PaneDetail';
import { PaneRow } from './PaneRow';
import { type SettingsPane, paneId } from './panes';
import { SettingsPopups } from './settingsPopups';

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
 * right the rows of whichever one holds the focus, reached with Right or OK and left with Left or Back. */
export function SettingsPanes({ header, sections }: Readonly<SettingsPanesProps>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const nav = useNav();
  const visible = sections.map((section) => section.filter(shown)).filter((x) => x.length > 0);
  const panes = visible.flat();
  const [activeId, setActiveId] = useState(() => (panes[0] ? paneId(panes[0]) : ''));
  const active = panes.find((pane) => paneId(pane) === activeId) ?? panes[0];
  const entryId = panes[0] ? paneId(panes[0]) : '';
  const rows = useRef(new Map<string, FocusHandle>());
  const detail = useRef<FocusHandle>(null);
  const onLeft = useRef(true);
  const popups = useRef(0);
  const [visit, setVisit] = useState(0);

  useFocusNav({
    onBack: () => {
      if (popups.current > 0) return false;
      if (onLeft.current || !active) {
        nav.back();
        return;
      }
      setVisit((n) => n + 1);
      rows.current.get(paneId(active))?.focus();
    },
  });

  const countPopup = (delta: 1 | -1) => {
    popups.current += delta;
  };

  const register = (id: string) => (handle: FocusHandle | null) => {
    if (handle) rows.current.set(id, handle);
    else rows.current.delete(id);
  };

  return (
    <SettingsPopups value={countPopup}>
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
                    handle={register(paneId(pane))}
                    onFocus={(id) => {
                      onLeft.current = true;
                      setActiveId(id);
                    }}
                    onBlur={() => {
                      onLeft.current = false;
                    }}
                    onEnter={() => detail.current?.focus()}
                  />
                ))}
              </Box>
            ))}
          </FocusColumn>
          {active ? <PaneDetail pane={active} entry={detail} visit={visit} /> : null}
        </FocusRegion>
        <BeaconMark />
      </Box>
    </SettingsPopups>
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
