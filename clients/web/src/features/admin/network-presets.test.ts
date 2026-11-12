import type { DeclaredPurpose } from '@kromatv/client/network';
import { describe, expect, it } from 'vitest';
import { presetRules } from '#web/features/admin/network-presets';

const PURPOSES: readonly DeclaredPurpose[] = [
  { caller: 'core', purpose: 'metadata' },
  { caller: 'core', purpose: 'updates' },
  { caller: 'tv.kroma.torrents', purpose: 'peers' },
  { caller: 'tv.kroma.torrents', purpose: 'trackers' },
  { caller: 'tv.kroma.indexer', purpose: 'search' },
];

const shape = (preset: Parameters<typeof presetRules>[0]) =>
  presetRules(preset, PURPOSES).rules.map(({ caller, purpose, host, action }) => ({
    caller,
    purpose,
    host,
    action,
  }));

describe('the downloads preset', () => {
  it('sends every module through the VPN, once each, and lets the server out directly', () => {
    expect(shape('downloadsVpn')).toEqual([
      { caller: 'tv.kroma.indexer', purpose: null, host: null, action: 'vpn' },
      { caller: 'tv.kroma.torrents', purpose: null, host: null, action: 'vpn' },
    ]);
    expect(presetRules('downloadsVpn', PURPOSES).defaultAction).toBe('allow');
  });
});

describe('the everything preset', () => {
  it('is one rule that sends every connection through the VPN', () => {
    expect(shape('everythingVpn')).toEqual([
      { caller: null, purpose: null, host: null, action: 'vpn' },
    ]);
  });
});

describe('the bare minimum preset', () => {
  it('lets out only what the server itself declared and blocks the rest', () => {
    const preset = presetRules('bareMinimum', PURPOSES);

    expect(preset.defaultAction).toBe('block');
    expect(shape('bareMinimum')).toEqual([
      { caller: 'core', purpose: 'metadata', host: null, action: 'direct' },
      { caller: 'core', purpose: 'updates', host: null, action: 'direct' },
    ]);
  });
});

describe('every preset', () => {
  it.each(['downloadsVpn', 'everythingVpn', 'bareMinimum'] as const)(
    'gives %s rules distinct ids',
    (preset) => {
      const ids = presetRules(preset, PURPOSES).rules.map((rule) => rule.id);

      expect(new Set(ids).size).toBe(ids.length);
    },
  );
});
