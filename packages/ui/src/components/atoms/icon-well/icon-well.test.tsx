// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { onScreen } from '#ui/testing';
import { IconWell } from './icon-well';

const ART = 'https://example.test/module.svg';

function show(src?: string | null) {
  const { container } = render(onScreen(<IconWell name="puzzle" size="xs" src={src} />));
  return {
    art: () => container.querySelector('img'),
    glyph: () => container.querySelector('svg'),
  };
}

afterEach(cleanup);

describe('IconWell', () => {
  it('draws its glyph when it has no art', () => {
    const { art, glyph } = show();

    expect(art()).toBeNull();
    expect(glyph()).not.toBeNull();
  });

  it('reads no art the same as none given', () => {
    expect(show(null).art()).toBeNull();
  });

  it('draws its art when it has some', () => {
    expect(show(ART).art()?.getAttribute('src')).toBe(ART);
  });

  it('keeps its glyph behind the art while it loads', () => {
    expect(show(ART).glyph()).not.toBeNull();
  });

  it('falls back on its glyph when the art fails', () => {
    const { art, glyph } = show(ART);

    fireEvent.error(art() as HTMLImageElement);

    expect(glyph()).not.toBeNull();
  });
});
