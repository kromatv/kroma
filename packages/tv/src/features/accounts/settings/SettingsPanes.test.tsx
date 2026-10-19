// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost, onScreen, wearsRing } from '@kromatv/ui/testing';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsGroup } from '#tv/app/settings/groups';
import { toggleItem } from '#tv/app/settings/items';
import { TvNavProvider } from '#tv/app/router';
import type { SettingsPane } from './panes';
import { SettingsPanes } from './SettingsPanes';

vi.mock('#tv/app/providers/handoffBeacon', () => ({ useHandoffBeacon: () => null }));

const { clearPressGuard, render } = createInputTestHost();

afterEach(cleanup);
afterEach(clearPressGuard);

const toggle = (id: string, label: 'profileMenu.perfHud' | 'settings.blur') =>
  toggleItem({ id, level: 'device', label, icon: 'check', useValue: () => [false, () => {}] });

const group = (id: SettingsGroup['id'], item: ReturnType<typeof toggle>): SettingsPane => ({
  kind: 'group',
  group: { id, label: `settings.${id}`, icon: 'check', items: [item], summary: [] },
});

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function mount(run = vi.fn()) {
  const about: SettingsPane = {
    kind: 'action',
    id: 'about',
    icon: 'info-circle',
    label: 'about.title',
    description: 'settings.aboutDesc',
    run,
  };
  render(
    onScreen(
      <I18nProvider locale="en">
        <TvNavProvider screens={{} as never}>
          <SettingsPanes
            header={null}
            sections={[
              [
                group('playback', toggle('hud', 'profileMenu.perfHud')),
                group('device', toggle('blur', 'settings.blur')),
              ],
              [about],
            ]}
          />
        </TvNavProvider>
      </I18nProvider>,
      { remote: true },
    ),
  );
  return run;
}

describe('SettingsPanes', () => {
  it('previews the focused group on the right and enters it with Right', () => {
    mount();
    expect(screen.getByText('Performance overlay')).toBeTruthy();

    press('ArrowDown');
    expect(screen.queryByText('Performance overlay')).toBeNull();
    expect(screen.getByText('Background blur')).toBeTruthy();

    press('ArrowRight');
    expect(wearsRing(screen.getByRole('switch'))).toBe(true);
    press('ArrowLeft');
    expect(wearsRing(screen.getByRole('switch'))).toBe(false);
  });

  it('describes an action on the right and runs it on OK', () => {
    const run = mount();
    press('ArrowDown');
    press('ArrowDown');
    clearPressGuard();
    expect(screen.getByText(/App and server versions/)).toBeTruthy();
    press('Enter');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('enters a group on OK, and Back returns to the group it came from', () => {
    mount();
    press('ArrowDown');
    clearPressGuard();
    press('Enter');
    expect(wearsRing(screen.getByRole('switch'))).toBe(true);

    press('Escape');
    expect(wearsRing(screen.getByRole('switch'))).toBe(false);
    expect(wearsRing(screen.getByRole('button', { name: /^Device/ }))).toBe(true);
  });
});
