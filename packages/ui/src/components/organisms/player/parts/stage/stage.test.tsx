// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { Animated } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { DEFAULT_SUB_APPEARANCE } from '../../lib/subtitle-appearance';
import { fakeController } from '../../player.fixture';
import { Stage } from './stage';

function stage(settingsShrink: boolean) {
  const timing = vi.spyOn(Animated, 'timing');
  timing.mockClear();
  const { container } = render(
    <I18nProvider locale="en">
      <Stage
        controller={fakeController()}
        stageSize={{ width: 1920, height: 1080 }}
        settingsShrink={settingsShrink}
        appearance={DEFAULT_SUB_APPEARANCE}
        raised={false}
        locked={false}
        onPress={() => {}}
        onLongPress={() => {}}
      />
    </I18nProvider>,
  );
  return { timing, node: container.querySelector('#kroma-player-stage') as HTMLElement };
}

describe('the settings card on the web', () => {
  it('shrinks on a CSS transition, never on Animated', () => {
    // react-native-web has no native driver: an Animated shrink there is a JS
    // animation, one render per frame on the thread the chrome ticks on.
    const { node, timing } = stage(true);
    expect(node.style.transitionProperty).toBe('transform');
    expect(node.style.transform).toContain('scale(');
    expect(timing).not.toHaveBeenCalled();
  });

  it('asks for the layer up front, so the first frame is not the promotion', () => {
    expect(stage(true).node.style.willChange).toBe('transform');
  });

  it('sits at full size until the panel takes the stage', () => {
    expect(stage(false).node.style.transform).toBe('scale(1)');
  });
});
