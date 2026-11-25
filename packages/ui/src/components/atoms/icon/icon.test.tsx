// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DirectionRoot } from '#ui/lib/direction-root.component';
import { declared } from '#ui/testing';
import { Icon, type IconName } from './icon.component';

afterEach(cleanup);

const drawn = (name: IconName, locale: string) => {
  const { container } = render(
    <DirectionRoot locale={locale}>
      <Icon name={name} />
    </DirectionRoot>,
  );
  const svg = container.querySelector('svg');
  if (!svg) {
    throw new TypeError('expected an svg');
  }
  return svg;
};

describe('Icon', () => {
  it('turns a glyph that points a way round in a language written right to left', () => {
    expect(declared(drawn('chevron-right', 'ar'), 'transform')).toBe('scaleX(-1)');
  });

  it('never turns a media glyph round', () => {
    expect(declared(drawn('player-track-next', 'ar'), 'transform')).toBeNull();
  });

  it('draws a glyph that points a way as it is in a language written left to right', () => {
    expect(declared(drawn('chevron-right', 'en'), 'transform')).toBeNull();
  });
});
