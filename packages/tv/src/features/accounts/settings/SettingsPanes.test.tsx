// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { ListRow } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen, wearsRing } from '@kromatv/ui/testing';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsGroup } from '#tv/app/settings/groups';
import { choiceItem, toggleItem } from '#tv/app/settings/items';
import { TvNavProvider } from '#tv/app/router';
import type { SettingsPane } from './panes';
import { SettingsPanes } from './SettingsPanes';

vi.mock('#tv/app/providers/handoffBeacon', () => ({ useHandoffBeacon: () => null }));

const { clearPressGuard, render } = createInputTestHost();

afterEach(cleanup);
afterEach(clearPressGuard);

const toggle = (id: string, label: 'profileMenu.perfHud' | 'settings.blur') =>
  toggleItem({ id, level: 'device', label, icon: 'check', useValue: () => [false, () => {}] });

const audio = choiceItem({
  id: 'audioLanguage',
  level: 'account',
  label: 'account.audioLanguage',
  icon: 'volume',
  pick: 'list',
  options: () => ['en', 'fr', 'de'],
  valueLabel: () => 'account.noPreference',
  useValue: () => ['en', () => {}],
});

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
  const quit: SettingsPane = {
    kind: 'action',
    id: 'quitApp',
    icon: 'power',
    label: 'profileMenu.quitApp',
    description: 'settings.quitAppDesc',
    run,
  };
  const about: SettingsPane = {
    kind: 'panel',
    id: 'about',
    icon: 'info-circle',
    label: 'about.title',
    Panel: ({ entry }) => (
      <ListRow.Root focusHandle={entry} onPress={() => {}}>
        <ListRow.Label>Release notes</ListRow.Label>
      </ListRow.Root>
    ),
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
                group('languages', audio),
              ],
              [quit, about],
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
    press('ArrowDown');
    clearPressGuard();
    expect(screen.getByText(/Closes KROMA/)).toBeTruthy();
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

  it('closes an open picker on Back and stays on the screen', () => {
    mount();
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowRight');
    clearPressGuard();
    press('Enter');
    expect(screen.getByRole('dialog')).toBeTruthy();

    clearPressGuard();
    press('Escape');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(wearsRing(screen.getByRole('button', { name: /^Preferred audio/ }))).toBe(true);
  });

  it('shows a panel on the right as its row takes focus, and Back returns to the row', () => {
    mount();
    for (let i = 0; i < 4; i += 1) press('ArrowDown');
    const notes = screen.getByRole('button', { name: 'Release notes' });
    expect(wearsRing(notes)).toBe(false);

    press('ArrowRight');
    expect(wearsRing(screen.getByRole('button', { name: 'Release notes' }))).toBe(true);

    press('Escape');
    expect(wearsRing(screen.getByRole('button', { name: /^About/ }))).toBe(true);
  });
});
