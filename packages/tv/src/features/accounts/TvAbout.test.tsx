// @vitest-environment jsdom

import { onScreen } from '@kroma/ui/testing';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setHardwareSource } from '#tv/app/clientHardware';
import { EnvProvider } from '#tv/app/providers/env';
import { TvNavProvider } from '#tv/app/router';
import { TvAbout } from '#tv/features/accounts/TvAbout';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setHardwareSource(null);
  sessionStorage.clear();
});

const GB = 1024 ** 3;

function withNavigator(extra: Record<string, unknown>) {
  vi.stubGlobal('navigator', { ...globalThis.navigator, userAgent: 'test', ...extra });
}

function mount(platform = 'Tizen') {
  render(
    onScreen(
      <EnvProvider platform={platform}>
        <TvNavProvider screens={{} as never}>
          <TvAbout />
        </TvNavProvider>
      </EnvProvider>,
    ),
  );
}

describe('TvAbout hardware rows', () => {
  it('names the running platform', () => {
    withNavigator({ hardwareConcurrency: 4 });
    mount('webOS');
    expect(screen.getByText('Platform')).toBeTruthy();
    expect(screen.getByText('webOS')).toBeTruthy();
  });

  it('shows the CPU core count when the engine reports it', () => {
    withNavigator({ hardwareConcurrency: 4 });
    mount();
    expect(screen.getByText('CPU')).toBeTruthy();
    expect(screen.getByText('4 cores')).toBeTruthy();
  });

  it('shows device memory in GB when Chromium reports it', () => {
    withNavigator({ hardwareConcurrency: 2, deviceMemory: 4 });
    mount();
    expect(screen.getByText('Memory')).toBeTruthy();
    expect(screen.getByText('4 GB')).toBeTruthy();
  });

  it('reads an injected source in preference to the Web APIs', () => {
    // The native shell has the numbers but no `navigator` fields: the source
    // wins, and memory arrives in bytes to be shown as coarse GB.
    withNavigator({});
    vi.stubGlobal('performance', {});
    setHardwareSource({
      cpuCores: () => 6,
      memoryBytes: () => 8 * GB,
      freeMemoryBytes: () => null,
    });
    mount('AppleTV');
    expect(screen.getByText('6 cores')).toBeTruthy();
    expect(screen.getByText('8 GB')).toBeTruthy();
  });

  it('shows the free RAM alongside the total when the source reports it', () => {
    withNavigator({});
    setHardwareSource({
      cpuCores: () => 4,
      memoryBytes: () => 8 * GB,
      // The reading that explains a struggling television, and the one the
      // browser shells can never answer.
      freeMemoryBytes: () => 1.25 * GB,
    });
    mount('AndroidTV');
    expect(screen.getByText('1.3 GB free of 8 GB')).toBeTruthy();
  });

  it('keeps a decimal on a set with well under a gigabyte to spare', () => {
    withNavigator({});
    setHardwareSource({
      cpuCores: () => 4,
      memoryBytes: () => 2 * GB,
      freeMemoryBytes: () => 0.4 * GB,
    });
    mount('AndroidTV');
    // Rounded to a whole gigabyte this reads "0 GB free", which is both wrong
    // and the exact case the row exists for.
    expect(screen.getByText('0.4 GB free of 2 GB')).toBeTruthy();
  });

  it('hides the rows when the injected source answers null', () => {
    withNavigator({});
    vi.stubGlobal('performance', {});
    setHardwareSource({
      cpuCores: () => null,
      memoryBytes: () => null,
      freeMemoryBytes: () => null,
    });
    mount('AndroidTV');
    expect(screen.queryByText('CPU')).toBeNull();
    expect(screen.queryByText('Memory')).toBeNull();
  });

  it('spaces the native platform labels', () => {
    withNavigator({});
    mount('AppleTV');
    expect(screen.getByText('Apple TV')).toBeTruthy();
    cleanup();
    mount('AndroidTV');
    expect(screen.getByText('Android TV')).toBeTruthy();
  });

  it('hides the CPU and memory rows when no API answers', () => {
    withNavigator({});
    vi.stubGlobal('performance', {});
    mount();
    expect(screen.queryByText('CPU')).toBeNull();
    expect(screen.queryByText('Memory')).toBeNull();
    // The platform row never depends on a Web API, so it still stands.
    expect(screen.getByText('Platform')).toBeTruthy();
  });
});
