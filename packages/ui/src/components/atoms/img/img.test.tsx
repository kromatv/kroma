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
afterEach(() => vi.restoreAllMocks());

const alreadyDecoded = () => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640);
};

const frame = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(null));
    });
  });
};

const reveal = (img: Element | null) => img?.getAttribute('data-kroma-reveal');

describe('Img', () => {
  it('waits transparent for its own load, then fades in', () => {
    const { container } = render(el({ src: 'a.jpg' }));
    const img = main(container);
    if (!img) throw new Error('no <img> rendered');

    expect(reveal(img)).toBe('wait');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');

    fireEvent.load(img);

    expect(reveal(img)).toBe('in');
  });

  it('shows art the browser had already decoded without a fade', () => {
    alreadyDecoded();

    const { container } = render(el({ src: 'a.jpg' }));

    expect(reveal(main(container))).toBe('shown');
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

  it('paints an https artwork url unchanged', () => {
    const { container } = render(el({ src: 'https://cdn.example.test/a.jpg?w=320' }));
    expect(main(container)?.getAttribute('src')).toBe('https://cdn.example.test/a.jpg?w=320');
  });

  it('paints a path on the server unchanged', () => {
    const { container } = render(el({ src: '/api/images/abc.webp?w=320' }));
    expect(main(container)?.getAttribute('src')).toBe('/api/images/abc.webp?w=320');
  });

  it('paints an object url and a data image unchanged', () => {
    const { container } = render(el({ src: 'blob:https://app.test/9f2c' }));
    expect(main(container)?.getAttribute('src')).toBe('blob:https://app.test/9f2c');

    const data = render(el({ src: 'data:image/png;base64,iVBORw0KGgo=' }));
    expect(main(data.container)?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('keeps a script scheme out of the src attribute however it is spelled', () => {
    for (const hostile of ['JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'vbscript:msgbox']) {
      const { container, unmount } = render(el({ src: hostile }));
      expect(container.querySelector('img')).toBeNull();
      unmount();
    }
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
      expect(reveal(next)).toBe('wait');

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
    expect(next.getAttribute('src')).toBe('b.jpg');
    expect(next).not.toBe(first);
    expect(reveal(next)).toBe('wait');
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

  describe('inside a card that fades as one unit', () => {
    const inUnit = (props: ImgProps) =>
      createElement(
        'div',
        { 'data-testid': 'frame' },
        createElement('div', { 'data-kroma-fade-unit': '', 'data-testid': 'unit' }, el(props)),
      );
    const parts = (root: HTMLElement) => ({
      frame: root.querySelector('[data-testid="frame"]') as HTMLElement,
      unit: root.querySelector('[data-testid="unit"]') as HTMLElement,
    });

    it('holds the unit until its art loads, then clears the frame under it', () => {
      const { container } = render(inUnit({ src: 'a.jpg' }));
      const { frame, unit } = parts(container);
      expect(unit.hasAttribute('data-kroma-wait')).toBe(true);
      expect(frame.hasAttribute('data-kroma-art-in')).toBe(false);

      const img = main(container);
      if (!img) throw new Error('no <img> rendered');
      fireEvent.load(img);

      expect(unit.hasAttribute('data-kroma-wait')).toBe(false);
      expect(frame.hasAttribute('data-kroma-art-in')).toBe(true);
    });

    it('never holds a unit whose art the browser had already decoded', () => {
      alreadyDecoded();
      const { container } = render(inUnit({ src: 'a.jpg' }));
      const { frame, unit } = parts(container);
      expect(unit.hasAttribute('data-kroma-wait')).toBe(false);
      expect(frame.hasAttribute('data-kroma-art-in')).toBe(true);
    });

    it('lets the unit go when the art fails or goes away', () => {
      const { container, rerender } = render(inUnit({ src: 'bad.jpg' }));
      const img = main(container);
      if (!img) throw new Error('no <img> rendered');
      fireEvent.error(img);
      expect(parts(container).unit.hasAttribute('data-kroma-wait')).toBe(false);

      rerender(inUnit({ src: 'a.jpg' }));
      expect(parts(container).unit.hasAttribute('data-kroma-wait')).toBe(true);
      rerender(inUnit({ src: null }));
      expect(parts(container).unit.hasAttribute('data-kroma-wait')).toBe(false);
      expect(parts(container).frame.hasAttribute('data-kroma-art-in')).toBe(false);
    });
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
