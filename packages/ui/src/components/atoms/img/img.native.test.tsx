// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitProvider } from '#ui/configure';
import type { ImageBackend, ImageBackendProps } from '#ui/lib/image-backend';
import { Img, type ImgProps } from './img';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mount(props: ImgProps) {
  const leaves: ImageBackendProps[] = [];
  const backend: ImageBackend = {
    fades: true,
    render: (at) => {
      leaves.push(at);
      return <View />;
    },
  };
  const view = render(
    <KitProvider config={{ image: backend, ground: 'dark' }}>
      <Img {...props} />
    </KitProvider>,
  );
  return {
    classes: () => (view.container.firstElementChild as HTMLElement).className,
    load: () => act(() => leaves.at(-1)?.onLoad?.({ width: 600, height: 900 })),
    settle: () => act(() => vi.advanceTimersByTime(400)),
    rerender: (next: ImgProps) =>
      view.rerender(
        <KitProvider config={{ image: backend, ground: 'dark' }}>
          <Img {...next} />
        </KitProvider>,
      ),
  };
}

const bare = () => mount({ src: null }).classes();

describe('Img on React Native', () => {
  it('stops drawing the background under opaque art once it has faded in', () => {
    const img = mount({ src: 'a.jpg', background: '#123456', opaque: true, duration: 400 });
    const filled = img.classes();
    expect(filled).not.toBe(bare());

    img.load();
    expect(img.classes()).toBe(filled);

    img.settle();
    expect(img.classes()).toBe(bare());
  });

  it('draws the background again while the next source loads', () => {
    const img = mount({ src: 'a.jpg', background: '#123456', opaque: true, duration: 400 });
    const filled = img.classes();
    img.load();
    img.settle();

    img.rerender({ src: 'b.jpg', background: '#123456', opaque: true, duration: 400 });

    expect(img.classes()).toBe(filled);
  });

  it('keeps the background under art that may be transparent', () => {
    const img = mount({ src: 'a.jpg', background: '#123456', duration: 400 });
    const filled = img.classes();

    img.load();
    img.settle();

    expect(img.classes()).toBe(filled);
  });
});
