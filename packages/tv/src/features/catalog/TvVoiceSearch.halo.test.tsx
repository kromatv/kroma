// @vitest-environment jsdom

import { declared, onScreen } from '@kroma/ui/testing';
import { cleanup, render } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceSearchBackend } from '#tv/app/voiceSearch';
import { TvVoiceSearch } from '#tv/features/catalog/TvVoiceSearch';

// Two react-native-web facts this file is built on: it picks a mock Animated
// that never touches the driver when NODE_ENV is `test`, and it warns about the
// missing driver ONCE per module registry. So the env is put back to what a
// browser bundle sees before anything imports it, and nothing else in this file
// renders first.
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'development');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const backend: VoiceSearchBackend = { available: () => true, Session: () => null };

const PULSE_MS = 1800;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function listen() {
  return render(onScreen(<TvVoiceSearch backend={backend} onText={() => {}} onDone={() => {}} />));
}

describe('the halo behind the microphone', () => {
  it('never asks a browser for the native driver it does not have', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    listen();

    const said = [...warn.mock.calls, ...error.mock.calls].map((args) => String(args[0]));
    expect(said.filter((line) => line.includes('useNativeDriver'))).toEqual([]);
  });

  it('schedules no JS animation, the pulse running for as long as the microphone is open', () => {
    const timing = vi.spyOn(Animated, 'timing');

    listen();

    expect(timing).not.toHaveBeenCalled();
  });

  it('breathes off a compositor keyframe rule instead', () => {
    listen();

    // The dialog renders into a portal, so the halo is not under the container.
    const breathing = [...document.querySelectorAll('div')].find(
      (el) => declared(el, 'animation-duration') === `${PULSE_MS}ms`,
    );
    expect(breathing).toBeTruthy();
  });
});
