// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost, onScreen, wearsRing } from '@kromatv/ui/testing';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TvNavProvider } from '#tv/app/router';
import { PinPanel } from './PinPanel';
import { SettingsPanes } from './SettingsPanes';

const state = vi.hoisted(() => ({
  user: { id: 'u1', username: 'Max', hasPin: false },
  setPin: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('#tv/app/providers/handoffBeacon', () => ({ useHandoffBeacon: () => null }));
vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ user: state.user, updateUser: state.updateUser }),
}));
vi.mock('#tv/app/providers/connection', () => ({
  useConnection: () => ({ client: { accounts: { setPin: state.setPin } } }),
}));

const { clearPressGuard, render } = createInputTestHost();

afterEach(cleanup);
afterEach(clearPressGuard);
afterEach(() => vi.clearAllMocks());

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
  clearPressGuard();
}

async function digits(code: string) {
  for (const d of code) {
    await act(async () => {
      screen.getByRole('button', { name: d }).click();
    });
  }
}

function mount() {
  render(
    onScreen(
      <I18nProvider locale="en">
        <TvNavProvider screens={{} as never}>
          <SettingsPanes
            header={null}
            sections={[
              [
                {
                  kind: 'panel',
                  id: 'pin',
                  icon: 'lock',
                  label: 'profileMenu.pin',
                  Panel: PinPanel,
                },
              ],
            ]}
          />
        </TvNavProvider>
      </I18nProvider>,
      { remote: true },
    ),
  );
}

describe('PinPanel', () => {
  it('sets a PIN inside the pane after asking for it twice', async () => {
    state.setPin.mockResolvedValue({ user: { ...state.user, hasPin: true } });
    mount();
    expect(screen.getByText('Set a PIN')).toBeTruthy();

    press('ArrowRight');
    press('Enter');
    expect(screen.getByText('Choose a 4 digit PIN')).toBeTruthy();
    await digits('1234');
    expect(screen.getByText('Enter the PIN again')).toBeTruthy();
    await digits('1234');

    expect(state.setPin).toHaveBeenCalledWith('1234', undefined);
    expect(state.updateUser).toHaveBeenCalledOnce();
    expect(wearsRing(screen.getByRole('button', { name: 'Set a PIN' }))).toBe(true);
  });

  it('leaves the keypad for the left row on Back without saving anything', () => {
    mount();
    press('ArrowRight');
    press('Enter');
    expect(wearsRing(screen.getByRole('button', { name: '1' }))).toBe(true);

    press('Escape');

    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
    expect(screen.getByText('Set a PIN')).toBeTruthy();
    expect(wearsRing(screen.getByRole('button', { name: /^PIN/ }))).toBe(true);
    expect(state.setPin).not.toHaveBeenCalled();
  });
});
