// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scaler } from '#ui/components/organisms/player/lib/metrics';
import { FocusScope } from '#ui/lib/focus-scope';
import { VolumeControl } from './volume-control';

afterEach(cleanup);

function pill(onToggle: () => void, wrap: (node: ReactNode) => ReactNode = (node) => node) {
  render(
    wrap(
      <VolumeControl
        muted={false}
        volume={0.5}
        max={1}
        px={scaler(1)}
        onFocus={vi.fn()}
        onBlur={vi.fn()}
        onToggle={onToggle}
        onVolume={vi.fn()}
        onNudge={vi.fn()}
        label="Volume"
        muteLabel="Mute"
      />,
    ),
  );
}

const inScope = (node: ReactNode) => <FocusScope>{node}</FocusScope>;

describe('VolumeControl', () => {
  for (const [where, wrap] of [
    ['inside a focus scope', inScope],
    ['on a page with no navigator', undefined],
  ] as const) {
    it(`leaves the sound on when the rail is clicked, ${where}`, () => {
      const onToggle = vi.fn();
      pill(onToggle, wrap);

      fireEvent.click(screen.getByRole('slider'));

      expect(onToggle).not.toHaveBeenCalled();
    });

    it(`mutes once when the speaker is clicked, ${where}`, () => {
      const onToggle = vi.fn();
      pill(onToggle, wrap);

      fireEvent.click(screen.getByLabelText('Mute'));

      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  }
});
