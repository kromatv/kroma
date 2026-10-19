import { describe, expect, it } from 'vitest';
import { DEVICE_GROUPS, groupAvailable, PROFILE_GROUPS } from './groups';
import type { SettingsItem } from './items';
import * as registry from './registry';

const SETTINGS = Object.values(registry).filter(
  (value): value is SettingsItem =>
    typeof value === 'object' && value !== null && 'kind' in value && 'useValue' in value,
);

describe('settings groups', () => {
  it('gives every declared setting a group when signed in', () => {
    const grouped = new Set(PROFILE_GROUPS.flatMap((g) => g.items.map((item) => item.id)));
    expect(SETTINGS.length).toBeGreaterThan(0);
    for (const item of SETTINGS) expect(grouped.has(item.id)).toBe(true);
  });

  it('names each setting once, so a value has one home', () => {
    for (const groups of [PROFILE_GROUPS, DEVICE_GROUPS]) {
      const ids = groups.flatMap((g) => g.items.map((item) => item.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps account settings out of the signed-out screen', () => {
    const levels = DEVICE_GROUPS.flatMap((g) =>
      g.items.map((item) => (item.id === 'locale' ? 'device' : item.level)),
    );
    expect(levels).not.toContain('account');
  });

  it('summarises a group only with settings it holds', () => {
    for (const group of [...PROFILE_GROUPS, ...DEVICE_GROUPS]) {
      for (const item of group.summary) expect(group.items).toContain(item);
    }
  });

  it('hides a group whose every item is gated away on this platform', () => {
    const [group] = PROFILE_GROUPS;
    if (!group) throw new Error('no group');
    const gated = group.items.map((item) => ({ ...item, available: () => false }));
    expect(groupAvailable(group)).toBe(true);
    expect(groupAvailable({ ...group, items: gated })).toBe(false);
  });
});
