// @vitest-environment jsdom

import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeMetrics } from '#ui/components/organisms/player/lib/metrics';
import { controlOrder } from '#ui/components/organisms/player/lib/nav';
import { TV_FLAGS } from '#ui/components/organisms/player/types';
import { FocusScope } from '#ui/lib/focus-scope';
import { I18nProvider } from '#ui/services/i18n';
import { wearsRing } from '#ui/testing';
import { createInputTestHost } from '#ui/testing-input';
import { ControlCluster } from './control-cluster';

const host = createInputTestHost();

afterEach(() => {
  cleanup();
  host.clearPressGuard();
});

const lit = (label: string) => wearsRing(screen.getByLabelText(label));

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function Row({ hasNext }: Readonly<{ hasNext: boolean }>) {
  return (
    <I18nProvider locale="en">
      <FocusScope>
        <ControlCluster
          playing
          muted={false}
          volume={0.5}
          pipActive={false}
          fullscreen={false}
          metrics={chromeMetrics(controlOrder(TV_FLAGS, hasNext), 1920)}
          onActivate={vi.fn()}
          onFocus={vi.fn()}
          onBlur={vi.fn()}
          onVolume={vi.fn()}
          onVolumeNudge={vi.fn()}
        />
      </FocusScope>
    </I18nProvider>
  );
}

describe('the control row under the remote', () => {
  it('stops on a next episode that arrives after the row, between forward and subtitles', () => {
    const view = host.render(<Row hasNext={false} />);
    view.rerender(<Row hasNext />);

    press('ArrowRight');
    expect(lit('Forward 10 s')).toBe(true);
    press('ArrowRight');
    expect(lit('Next episode')).toBe(true);
    press('ArrowRight');
    expect(lit('Subtitles')).toBe(true);
  });
});
