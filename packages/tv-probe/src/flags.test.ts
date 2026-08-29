import { describe, expect, it } from 'vitest';
import { flags } from './flags';

describe('the flags a run is asked for', () => {
  it('serves the shell itself and throttles the CPU sixfold when given nothing', () => {
    expect(flags([])).toEqual({
      url: '',
      locale: 'en',
      presses: 24,
      items: 120,
      growth: 3,
      minFps: 20,
      shot: '',
      tall: false,
      throttle: 6,
    });
  });

  it('takes the value that follows each flag', () => {
    const argv = ['--url', 'http://tv:5179', '--locale', 'fr', '--keys', '48', '--min-fps', '30'];

    expect(flags(argv)).toMatchObject({
      url: 'http://tv:5179',
      locale: 'fr',
      presses: 48,
      minFps: 30,
    });
  });

  it('keeps the default of a flag written with no value after it', () => {
    expect(flags(['--shot'])).toMatchObject({ shot: '' });
  });

  it('reads the tall viewport as a switch', () => {
    expect(flags(['--tall'])).toMatchObject({ tall: true });
  });
});
