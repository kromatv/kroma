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

describe('the settings card on a native shell', () => {
  it('shrinks on the native driver, never on a CSS transition', () => {
    // The transition is the web's road; here the driver is what keeps the scale
    // off the thread the chrome ticks on.
    const { node, timing } = stage(true);
    expect(node.style.transitionProperty).toBe('');
    expect(timing).toHaveBeenCalled();
    expect(timing.mock.calls.every(([, config]) => config.useNativeDriver)).toBe(true);
  });
});
