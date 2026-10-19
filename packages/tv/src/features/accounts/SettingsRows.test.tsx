// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { choiceItem, type SettingsEntry, toggleItem } from '#tv/app/settings/items';
import { reactivePref, useStoredPref } from '#tv/app/settings/store';
import { SettingsRows } from './SettingsRows';

const { clearPressGuard, render: renderRaw } = createInputTestHost();

// Every kit control is a node of the spatial navigator; render inside the
// same scope the router gives a real screen.
const render = (ui: ReactElement) => renderRaw(onScreen(ui));

function show(items: readonly SettingsEntry[]) {
  return render(
    <I18nProvider locale="en">
      <SettingsRows items={items} />
    </I18nProvider>,
  );
}

afterEach(cleanup);
// The press guard lives at module scope, so it survives unmounting (and a
// test) unless dropped here.
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
        useValue: () => useStoredPref(pref),
      }),
    ]);
    const row = screen.getByRole('button');
    fireEvent.click(row);
    expect(pref.get()).toBe('azerty');
    fireEvent.click(row);
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
        useValue: () => useStoredPref(pref),
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
        useValue: () => ['fr', set] as const,
      }),
    ]);

    // The row itself picks nothing: it opens the list.
    fireEvent.click(screen.getByRole('button', { name: /audio/i }));
    expect(set).not.toHaveBeenCalled();

    // getByText, not just the accessible name: the accessible name comes from
    // `label` and survives even when the visible label has collapsed, which is
    // the failure this picker shipped with.
    expect(screen.getByText('Swedish')).toBeTruthy();

    // The dialog's OK guard arms on mount and would otherwise swallow this
    // press in a real test-clock window.
    clearPressGuard();
    // An option of the list, not a button: the picker is a one-of-N choice and
    // says so, with the chosen row carrying the selection.
    fireEvent.click(screen.getByRole('option', { name: 'Swedish' }));
    expect(set).toHaveBeenCalledWith('sv');
  });

  it('flips a toggle and says which way it is set', () => {
    const setToggle = vi.fn();
    show([
      toggleItem({
        id: 'gpu',
        level: 'shell',
        label: 'profileMenu.gpuRendering',
        icon: 'check',
        useValue: () => [false, setToggle] as const,
      }),
    ]);
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(setToggle).toHaveBeenCalledWith(true);
  });

  it('skips unavailable items and falsy inline entries', () => {
    const toggle = (id: string, available: boolean) =>
      toggleItem({
        id,
        level: 'device',
        label: 'profileMenu.perfHud',
        icon: 'check',
        available: () => available,
        useValue: () => [false, () => {}] as const,
      });
    show([false, null, undefined, toggle('gated', false), toggle('shown', true)]);
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });
});
