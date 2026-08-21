// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGround, watchGround } from './ground.ts';

const paint = (value: string) =>
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: () => value,
  } as unknown as CSSStyleDeclaration);

// jsdom implements no matchMedia, and watchGround asks the OS through one.
const media = (over: Partial<MediaQueryList> = {}) => {
  const list = { addEventListener: vi.fn(), removeEventListener: vi.fn(), ...over };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => list),
  );
  return list;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('readGround', () => {
  it('reads paper as light and charcoal as dark', () => {
    paint('#F7F5F1');
    expect(readGround(document.body)).toBe('light');

    paint('#0A0A0C');
    expect(readGround(document.body)).toBe('dark');
  });

  it('weighs the channels rather than averaging them', () => {
    paint('#0000FF');
    expect(readGround(document.body)).toBe('dark');

    paint('#00FF00');
    expect(readGround(document.body)).toBe('light');
  });

  it('falls back to dark, the product default, for anything it cannot read', () => {
    paint('');
    expect(readGround(document.body)).toBe('dark');

    paint('var(--something)');
    expect(readGround(document.body)).toBe('dark');

    paint('#fff');
    expect(readGround(document.body)).toBe('dark');
  });
});

describe('watchGround', () => {
  it('answers when the visitor stamps the document, and stops on the disposer', async () => {
    media();
    const onChange = vi.fn();
    const dispose = watchGround(onChange);

    document.documentElement.dataset.theme = 'light';
    await new Promise((r) => setTimeout(r, 0));
    expect(onChange).toHaveBeenCalled();

    dispose();
    onChange.mockClear();
    document.documentElement.dataset.theme = 'dark';
    await new Promise((r) => setTimeout(r, 0));
    expect(onChange).not.toHaveBeenCalled();

    delete document.documentElement.dataset.theme;
  });

  it('listens to the OS through the media query and lets go of it again', () => {
    const list = media();

    const dispose = watchGround(() => undefined);
    expect(list.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    dispose();
    expect(list.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
