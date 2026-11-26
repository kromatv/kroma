import { describe, expect, it } from 'vitest';
import { parseOptions } from './options';

describe('the options of a sweep', () => {
  it('read the web client and the Tizen shell in every language by default', () => {
    const options = parseOptions([]);

    expect(options.targets.map((target) => `${target.id}:${target.port}`)).toEqual([
      'web:3000',
      'tizen:5174',
    ]);
    expect(options).toMatchObject({
      languages: null,
      server: 'http://localhost:4040',
      report: false,
      catalogOnly: false,
    });
  });

  it('move a target to the port it is served on', () => {
    const options = parseOptions([
      '--targets',
      'web,webos',
      '--port',
      'web=3200',
      '--port',
      'webos=5275',
    ]);

    expect(options.targets.map((target) => target.port)).toEqual([3200, 5275]);
  });

  it('read the languages, the server and the flags given', () => {
    const argv = [
      '--langs',
      'de, vi',
      '--server',
      'http://nas.local:4040/',
      '--report',
      '--catalog-only',
    ];

    expect(parseOptions(argv)).toMatchObject({
      languages: ['de', 'vi'],
      server: 'http://nas.local:4040',
      report: true,
      catalogOnly: true,
    });
  });

  it.each([
    ['a native target', ['--targets', 'appletv'], /no page to read/],
    [
      'a port for a target not swept',
      ['--targets', 'web', '--port', 'tizen=5274'],
      /does not sweep/,
    ],
    ['a port that is not a number', ['--port', 'web=soon'], /whole number/],
    ['a page budget of nothing', ['--max-pages', '0'], /whole number/],
    ['a flag it does not know', ['--fast'], /Unknown option/],
  ])('refuse %s', (_what, argv, message) => {
    expect(() => parseOptions(argv)).toThrow(message);
  });
});
