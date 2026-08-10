// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Img, type ImgProps } from './img';

const el = (props: ImgProps) => createElement(Img, props);
const main = (root: HTMLElement) =>
  root.querySelector('img:not([aria-hidden])') as HTMLImageElement | null;
const under = (root: HTMLElement) =>
  root.querySelector('img[aria-hidden="true"]') as HTMLImageElement | null;

afterEach(cleanup);

// The web reveal waits one frame before it turns opaque, so the browser paints
// the transparent state the CSS transition starts from. Tests have to let that
// frame happen before asserting the settled opacity.
const frame = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(null));
    });
  });
};

describe('Img', () => {
  it('fades the artwork in with a CSS animation, and is never left invisible', () => {
    const { container } = render(el({ src: 'a.jpg' }));
    const img = main(container);
    if (!img) throw new Error('no <img> rendered');
    // The fade is the browser's, so the element's RESTING state is opaque: an
    // image whose reveal depended on React state stayed invisible whenever that
    // state never arrived, with its bytes already decoded.
    expect(img.style.animation).toContain('kroma-img-in');
    expect(img.style.opacity).toBe('');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('loads eagerly at high priority when marked the LCP art', () => {
    const { container } = render(el({ src: 'a.jpg', priority: true }));
    const img = main(container);
    expect(img?.getAttribute('loading')).toBe('eager');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
  });

  it('drops the image when the source fails to load', () => {
    const { container } = render(el({ src: 'bad.jpg', background: 'red' }));
    const img = main(container);
    if (!img) throw new Error('no <img> rendered');
    fireEvent.error(img);
    expect(main(container)).toBeNull();
  });

  it('renders the fallback when there is no source, and after an error', () => {
    const fallback = createElement('span', { 'data-testid': 'fb' });
    const { container, rerender } = render(el({ src: null, fallback }));
    expect(main(container)).toBeNull();
    expect(container.querySelector('[data-testid="fb"]')).not.toBeNull();

    rerender(el({ src: 'bad.jpg', fallback }));
    const img = main(container);
    if (!img) throw new Error('no <img> rendered');
    fireEvent.error(img);
    expect(container.querySelector('[data-testid="fb"]')).not.toBeNull();
  });

  it('shows the placeholder only while loading', async () => {
    const placeholder = createElement('span', { 'data-testid': 'ph' });
    const { container } = render(el({ src: 'a.jpg', placeholder }));
    expect(container.querySelector('[data-testid="ph"]')).not.toBeNull();
    const img = main(container);
    if (!img) throw new Error('no <img> rendered');
    fireEvent.load(img);
    await frame();
    expect(container.querySelector('[data-testid="ph"]')).toBeNull();
  });

  it('refuses a script-scheme source outright', () => {
    const { container } = render(el({ src: 'javascript:alert(1)' }));
    expect(main(container)).toBeNull();
  });

  it('cross-fades on src change: holds the previous image underneath until the new one settles', () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(el({ src: 'a.jpg', duration: 100 }));
      const first = main(container);
      if (!first) throw new Error('no <img> rendered');
      fireEvent.load(first);

      rerender(el({ src: 'b.jpg', duration: 100 }));
      expect(under(container)?.getAttribute('src')).toBe('a.jpg');
      const next = main(container);
      if (!next) throw new Error('no incoming <img> rendered');
      expect(next.getAttribute('src')).toBe('b.jpg');
      expect(next.style.animation).toContain('kroma-img-in');

      fireEvent.load(next);
      act(() => vi.advanceTimersByTime(16));

      act(() => vi.advanceTimersByTime(100));
      expect(under(container)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives each source its own reveal, keyed on the source', async () => {
    const { container, rerender } = render(el({ src: 'a.jpg', duration: 100 }));
    const first = main(container);
    if (!first) throw new Error('no <img> rendered');
    fireEvent.load(first);
    rerender(el({ src: 'b.jpg', duration: 100 }));

    const next = main(container);
    if (!next) throw new Error('no incoming <img> rendered');
    // A new element for the new source (keyed on it), so its animation runs
    // from the start rather than inheriting the previous one's finished state.
    expect(next.getAttribute('src')).toBe('b.jpg');
    expect(next).not.toBe(first);
    expect(next.style.animation).toContain('kroma-img-in');
    await frame();
  });

  it('keeps the placeholder and the previous image up through that frame', async () => {
    const placeholder = createElement('span', { 'data-testid': 'ph' });
    const { container, rerender } = render(el({ src: 'a.jpg', duration: 100, placeholder }));
    const first = main(container);
    if (!first) throw new Error('no <img> rendered');
    fireEvent.load(first);
    rerender(el({ src: 'b.jpg', duration: 100, placeholder }));

    await frame();
    expect(container.querySelector('[data-testid="ph"]')).not.toBeNull();
    expect(under(container)?.getAttribute('src')).toBe('a.jpg');
  });

  it('skips the underlay when noCrossFade is set', () => {
    const { container, rerender } = render(el({ src: 'a.jpg', noCrossFade: true }));
    const first = main(container);
    if (!first) throw new Error('no <img> rendered');
    fireEvent.load(first);
    rerender(el({ src: 'b.jpg', noCrossFade: true }));
    expect(under(container)).toBeNull();
  });
});
