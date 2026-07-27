// @vitest-environment jsdom
import { I18nProvider } from '@kroma/ui';
import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionItem, choiceItem, type SettingsEntry, toggleItem } from '#tv/app/settings/items';
import { reactivePref, useStoredPref } from '#tv/app/settings/store';
import { SettingsRows } from './SettingsRows';

/** Every kit control is a node of the spatial navigator, and a node needs a
 * navigator - the router gives every screen one. A test renders inside the same
 * scope so the tree it mounts is the tree the app mounts. */
const render = (ui: ReactElement) => renderRaw(onScreen(ui));

function show(items: readonly SettingsEntry[]) {
  return render(
    <I18nProvider locale="en">
      <SettingsRows items={items} />
    </I18nProvider>,
  );
}

afterEach(cleanup);
// Opening a dialog arms the OK guard (see press-guard: one physical press must
// not carry into the screen it opened). It lives at module scope so it survives
// unmounting - which means it survives a TEST too unless it is dropped here.
afterEach(clearPressGuard);

describe('SettingsRows', () => {
  it('cycles a choice row through its options on activation', () => {
    const pref = reactivePref('kroma:test-rows-cycle', ['abc', 'azerty'], 'abc');
    show([
      choiceItem({
        id: 'kbd',
        level: 'device',
        label: 'keyboardLayout.title',
        icon: 'check',
        options: () => ['abc', 'azerty'] as const,
        valueLabel: () => 'keyboardLayout.title',
        use: () => useStoredPref(pref),
      }),
    ]);
    const row = screen.getByRole('button');
    fireEvent.click(row);
    expect(pref.get()).toBe('azerty');
    fireEvent.click(row); // wraps back around
    expect(pref.get()).toBe('abc');
  });

  it('hides a choice row with fewer than two options', () => {
    const pref = reactivePref('kroma:test-rows-single', ['abc'], 'abc');
    show([
      choiceItem({
        id: 'single',
        level: 'device',
        label: 'keyboardLayout.title',
        icon: 'check',
        options: () => ['abc'] as const,
        valueLabel: () => 'keyboardLayout.title',
        use: () => useStoredPref(pref),
      }),
    ]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens a picker instead of cycling when a choice asks for a list', () => {
    const set = vi.fn();
    show([
      choiceItem({
        id: 'audioLanguage',
        level: 'account',
        label: 'account.audioLanguage',
        icon: 'check',
        pick: 'list',
        options: () => ['fr', 'en', 'sv'] as const,
        valueLabel: (value) => `lang.${value}` as const,
        use: () => ['fr', set] as const,
      }),
    ]);

    // The row itself picks nothing: it opens the list.
    fireEvent.click(screen.getByRole('button', { name: /audio/i }));
    expect(set).not.toHaveBeenCalled();

    // getByText, not just the accessible name: the name comes from the row's
    // `label` prop and survives even when the visible label has collapsed, which
    // is exactly the failure this picker shipped with.
    expect(screen.getByText('Swedish')).toBeTruthy();

    // The dialog armed the OK guard on mount; the pick is the viewer's NEXT,
    // deliberate press, which in a test arrives before the window elapses.
    clearPressGuard();
    fireEvent.click(screen.getByRole('button', { name: 'Swedish' }));
    expect(set).toHaveBeenCalledWith('sv');
  });

  it('flips a toggle and runs an action', () => {
    const setToggle = vi.fn();
    const run = vi.fn();
    show([
      toggleItem({
        id: 'gpu',
        level: 'shell',
        label: 'profileMenu.gpuRendering',
        icon: 'check',
        use: () => [false, setToggle] as const,
      }),
      actionItem({ id: 'quit', label: 'profileMenu.quitApp', icon: 'check', run }),
    ]);
    const [toggle, action] = screen.getAllByRole('button');
    if (!toggle || !action) throw new Error('expected a toggle and an action row');
    fireEvent.click(toggle);
    expect(setToggle).toHaveBeenCalledWith(true);
    fireEvent.click(action);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('skips unavailable items and falsy inline entries', () => {
    const run = vi.fn();
    show([
      false,
      null,
      undefined,
      actionItem({
        id: 'gated',
        label: 'profileMenu.quitApp',
        icon: 'check',
        available: () => false,
        run,
      }),
      actionItem({ id: 'shown', label: 'profileMenu.quitApp', icon: 'check', run }),
    ]);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
