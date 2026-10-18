import { describe, expect, it } from 'vitest';
import { scoredFirst } from './matched-formats';

const named = (name: string, score: number) => ({ name, score });

describe('scoredFirst', () => {
  it('puts what the profile paid for ahead of what it ignored', () => {
    const sorted = scoredFirst([named('VO', 0), named('VFF', 500), named('HEVC', 400)]);

    expect(sorted.map((format) => format.name)).toEqual(['VFF', 'HEVC', 'VO']);
  });

  it('reads a penalty as something the profile said, not as nothing', () => {
    const sorted = scoredFirst([named('MULTi', 0), named('CAM', -800)]);

    expect(sorted.map((format) => format.name)).toEqual(['CAM', 'MULTi']);
  });

  it('leaves two formats of one weight in the order they matched', () => {
    const sorted = scoredFirst([named('VO', 0), named('Français', 0)]);

    expect(sorted.map((format) => format.name)).toEqual(['VO', 'Français']);
  });

  it('leaves the list it was given alone', () => {
    const formats = [named('VO', 0), named('VFF', 500)];

    scoredFirst(formats);

    expect(formats.map((format) => format.name)).toEqual(['VO', 'VFF']);
  });
});
