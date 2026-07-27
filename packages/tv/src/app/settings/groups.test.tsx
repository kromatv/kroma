// @vitest-environment jsdom
//
// The settings menu, one step deeper. Signed in, the flat menu was twelve rows
// on a 1080 screen: the profile's own name scrolled off the top and "Sign out"
// sat below the fold. These lock in what the step buys - a menu that fits - and
// what it must not cost: every setting still reachable, still declared once.

import { I18nProvider } from '@kroma/ui';
import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { groupItem, PROFILE_SETTINGS, SETTINGS_GROUPS } from '#tv/app/settings/registry';
import { SettingsRows } from '#tv/features/accounts/SettingsRows';

afterEach(cleanup);
afterEach(clearPressGuard);

const GROUPS = Object.values(SETTINGS_GROUPS);

describe('settings groups', () => {
  it('covers every setting the flat profile menu used to list', () => {
    const grouped = new Set(GROUPS.flatMap((g) => g.items.map((item) => item.id)));
    for (const item of PROFILE_SETTINGS) {
      expect(grouped.has(item.id)).toBe(true);
    }
  });

  it('names each setting once, so a value has one home', () => {
    const ids = GROUPS.flatMap((g) => g.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders one row per group, not one per setting', () => {
    render(
      onScreen(
        <I18nProvider locale="en">
          <SettingsRows items={GROUPS.map((g) => groupItem(g, () => {}))} />
        </I18nProvider>,
      ),
    );
    expect(screen.getAllByRole('button')).toHaveLength(GROUPS.length);
    expect(screen.getByText('Languages')).toBeTruthy();
    expect(screen.getByText('Playback')).toBeTruthy();
    expect(screen.getByText('Device')).toBeTruthy();
  });

  it('opens the group it names', () => {
    const opened: string[] = [];
    const rows = GROUPS.map((g) => groupItem(g, () => opened.push(g.id)));
    render(
      onScreen(
        <I18nProvider locale="en">
          <SettingsRows items={rows} />
        </I18nProvider>,
      ),
    );
    screen.getByText('Playback').click();
    expect(opened).toEqual(['playback']);
  });

  it('hides a group whose every item is gated away on this platform', () => {
    const gated = SETTINGS_GROUPS.device.items.map((item) => ({ ...item, available: () => false }));
    const row = groupItem({ ...SETTINGS_GROUPS.device, items: gated }, () => {});
    expect(row.available?.()).toBe(false);
  });
});
