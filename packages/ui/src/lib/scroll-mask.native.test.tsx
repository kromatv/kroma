// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Animated, Text, type View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.doUnmock('#ui/lib/gpu-masks');
  vi.doUnmock('#ui/lib/stable-masked-view');
  vi.doUnmock('react-native-svg');
});

const Nothing = () => null;

async function page(masks: { GPU_MASKS: boolean; PAGE_MASKS: boolean }, ground: boolean) {
  vi.resetModules();
  vi.doMock('#ui/lib/gpu-masks', () => masks);
  vi.doMock('react-native-svg', () => ({
    default: Nothing,
    Defs: Nothing,
    LinearGradient: Nothing,
    Rect: Nothing,
    Stop: Nothing,
  }));
  vi.doMock('#ui/lib/stable-masked-view', () => ({
    StableMaskedView: ({ children }: { children: React.ReactNode }) => (
      <Text testID="masked">{children}</Text>
    ),
  }));
  const { ScrollMask } = await import('./scroll-mask');
  const { ScrollPositionContext } = await import('./scroll-position');
  const position = { offset: new Animated.Value(0), content: createRef<View>() };
  render(
    <ScrollPositionContext.Provider value={position}>
      <ScrollMask inset={104} ground={ground}>
        <Text>rails</Text>
      </ScrollMask>
    </ScrollPositionContext.Provider>,
  );
}

describe('<ScrollMask>', () => {
  it('masks its content where a page-sized mask is affordable', async () => {
    await page({ GPU_MASKS: true, PAGE_MASKS: true }, true);

    expect(screen.getByTestId('masked')).toBeTruthy();
    expect(screen.getByText('rails')).toBeTruthy();
  });

  it('leaves content on the ground colour unmasked where a page-sized mask is costly', async () => {
    await page({ GPU_MASKS: true, PAGE_MASKS: false }, true);

    expect(screen.queryByTestId('masked')).toBeNull();
    expect(screen.getByText('rails')).toBeTruthy();
  });

  it('still masks there what does not sit on the ground colour', async () => {
    await page({ GPU_MASKS: true, PAGE_MASKS: false }, false);

    expect(screen.getByTestId('masked')).toBeTruthy();
  });
});
