// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitProvider } from '#ui/configure';
import type { ImageBackend, ImageBackendProps } from '#ui/lib/image-backend';
import { markImageReady, resetImageReady } from '#ui/lib/image-ready';
import { Img, type ImgProps } from './img';

beforeEach(() => {
  vi.useFakeTimers();
  resetImageReady();
});
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
    fadeMs: () => leaves.at(-1)?.fadeMs,
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
  it('fades in art that is not ready yet', () => {
    expect(mount({ src: 'a.jpg', duration: 400 }).fadeMs()).toBe(400);
  });

  it('draws art that is already ready at once', () => {
    markImageReady('a.jpg');

    expect(mount({ src: 'a.jpg', duration: 400 }).fadeMs()).toBe(0);
  });

  it('draws art at once the next time after it has loaded', () => {
    mount({ src: 'a.jpg', duration: 400 }).load();

    expect(mount({ src: 'a.jpg', duration: 400 }).fadeMs()).toBe(0);
  });

  it('stops drawing the background under opaque art once it has faded in', () => {
    const img = mount({ src: 'a.jpg', background: '#123456', opaque: true, duration: 400 });
    const filled = img.classes();
    expect(filled).not.toBe(bare());

    img.load();
    expect(img.classes()).toBe(filled);

    img.settle();
    expect(img.classes()).toBe(bare());
  });

  it('keeps it off while a cross-fade holds the faded art under the next', () => {
    const img = mount({ src: 'a.jpg', background: '#123456', opaque: true, duration: 400 });
    img.load();
    img.settle();

    img.rerender({ src: 'b.jpg', background: '#123456', opaque: true, duration: 400 });

    expect(img.classes()).toBe(bare());
  });

  it('draws it again while the next source loads with nothing under it', () => {
    const at = { background: '#123456', opaque: true, noCrossFade: true, duration: 400 };
    const img = mount({ src: 'a.jpg', ...at });
    const filled = img.classes();
    img.load();
    img.settle();

    img.rerender({ src: 'b.jpg', ...at });

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
