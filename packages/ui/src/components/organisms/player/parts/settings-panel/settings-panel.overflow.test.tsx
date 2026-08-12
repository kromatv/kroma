// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { chromeMetrics } from '../../lib/metrics';
import { type ControlId, controlOrder } from '../../lib/nav';
import type { SubtitleAppearance } from '../../lib/subtitle-appearance';
import { type PlayerController, WEB_FLAGS } from '../../types';
import type { SubtitleGenBundle } from './settings/gen';
import { SettingsPanel } from './settings-panel';

afterEach(cleanup);

function controller(): PlayerController {
  return {
    qualities: [],
    qualityId: '',
    setQuality: vi.fn(),
    audioTracks: [],
    audioIndex: null,
    setAudio: vi.fn(),
    audioFilter: 'off',
    audioFilterSupported: false,
    setAudioFilter: vi.fn(),
    subtitles: [],
    subtitleIndex: null,
    setSubtitle: vi.fn(),
    muted: false,
    rate: 1,
    setRate: vi.fn(),
  } as unknown as PlayerController;
}

const GEN = { supported: false } as unknown as SubtitleGenBundle;
const APPEARANCE = {} as SubtitleAppearance;

function panel(overflow: readonly ControlId[], onControl = vi.fn()): ReactElement {
  return (
    <I18nProvider locale="en">
      <SettingsPanel
        controller={controller()}
        appearance={APPEARANCE}
        onAppearanceChange={vi.fn()}
        statsOn={false}
        onToggleStats={vi.fn()}
        subtitleGen={GEN}
        overflow={overflow}
        onControl={onControl}
        onClose={vi.fn()}
      />
    </I18nProvider>
  );
}

const PHONE = chromeMetrics(controlOrder({ ...WEB_FLAGS, cast: true }, true), 390);

describe('the player settings panel, holding what the row shed', () => {
  it('offers nothing extra on a stage that fits the whole row', () => {
    render(panel([]));
    expect(screen.queryByLabelText('Move to TV')).toBeNull();
    expect(screen.queryByLabelText('Picture in picture')).toBeNull();
    expect(screen.getByLabelText('Quality')).toBeTruthy();
  });

  it('grows a row for every control a phone-width window could not fit', () => {
    render(panel(PHONE.overflow));
    // Not a fixture list: whatever the fitter shed has to be reachable.
    expect(PHONE.overflow.length).toBeGreaterThan(0);
    for (const id of PHONE.overflow) {
      // Audio and subtitles are the two the menu already lists.
      const label = {
        cast: 'Move to TV',
        pip: 'Picture in picture',
        next: 'Next episode',
        volume: 'Mute',
      }[id as 'cast' | 'pip' | 'next' | 'volume'];
      if (label) expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getAllByLabelText('Audio track')).toHaveLength(1);
    expect(screen.getAllByLabelText('Subtitles')).toHaveLength(1);
  });

  it('announces the toggle rows as switches, with the state they draw', () => {
    render(panel([]));
    const stats = screen.getByLabelText('Statistics');
    expect(stats.getAttribute('role')).toBe('switch');
    expect(stats.getAttribute('aria-checked')).toBe('false');
    // A row that opens a sub-view is not a switch and claims no state.
    expect(screen.getByLabelText('Quality').getAttribute('aria-checked')).toBeNull();
  });

  it('runs the control it was given, by its own id', () => {
    const onControl = vi.fn();
    render(panel(['cast', 'pip'], onControl));
    fireEvent.click(screen.getByLabelText('Move to TV'));
    expect(onControl).toHaveBeenCalledWith('cast');
    fireEvent.click(screen.getByLabelText('Picture in picture'));
    expect(onControl).toHaveBeenCalledWith('pip');
  });

  it('ignores an overflow it has no way to run', () => {
    render(
      <I18nProvider locale="en">
        <SettingsPanel
          controller={controller()}
          appearance={APPEARANCE}
          onAppearanceChange={vi.fn()}
          statsOn={false}
          onToggleStats={vi.fn()}
          subtitleGen={GEN}
          overflow={['cast']}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.queryByLabelText('Move to TV')).toBeNull();
  });
});
