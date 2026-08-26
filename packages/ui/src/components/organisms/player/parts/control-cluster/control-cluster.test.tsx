// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeMetrics } from '#ui/components/organisms/player/lib/metrics';
import { controlOrder } from '#ui/components/organisms/player/lib/nav';
import { TV_FLAGS, WEB_FLAGS } from '#ui/components/organisms/player/types';
import { I18nProvider } from '#ui/services/i18n';
import { ControlCluster } from './control-cluster';

afterEach(cleanup);

function row(stage: number, flags = TV_FLAGS) {
  const metrics = chromeMetrics(controlOrder(flags, true), stage);
  const { container } = render(
    <I18nProvider locale="en">
      <ControlCluster
        focused={null}
        playing
        muted={false}
        volume={0.5}
        pipActive={false}
        fullscreen={false}
        metrics={metrics}
        onActivate={vi.fn()}
        onFocus={vi.fn()}
        onVolume={vi.fn()}
      />
    </I18nProvider>,
  );
  const sides = (container.firstElementChild as HTMLElement).children;
  return { metrics, left: sides.item(0) as HTMLElement, right: sides.item(2) as HTMLElement };
}

describe('ControlCluster', () => {
  it('leaves the same width on both sides of the transport, at every scale', () => {
    for (const stage of [1920, 1600, 1280, 1024]) {
      for (const flags of [TV_FLAGS, WEB_FLAGS]) {
        const { left, right } = row(stage, flags);

        const width = getComputedStyle(right).width;

        expect(width, `stage ${stage}`).toMatch(/^\d+px$/);
        expect(getComputedStyle(left).width, `stage ${stage}`).toBe(width);
        cleanup();
      }
    }
  });

  it('holds the cluster at the width it was measured for, so its circles never reach the transport', () => {
    const { metrics, right } = row(1920, WEB_FLAGS);

    expect(getComputedStyle(right).width).toBe(`${metrics.clusterWidth}px`);
  });
});
