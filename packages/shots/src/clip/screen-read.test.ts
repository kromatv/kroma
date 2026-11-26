// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { clippedTree, FakePage, fakeReader } from './fake-page.fixture';
import { readScreen, unreadAt } from './screen-read';

const WHERE = { language: 'de', target: 'web', screen: '/admin' };

describe('reading one screen', () => {
  it('lists each clipped text with where it was read', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.stubGlobal('__KROMA_UI__', fakeReader(clippedTree('Gefolgt', null)));
    document.documentElement.lang = 'de';

    const read = await readScreen(new FakePage(), WHERE);

    expect(read.unread).toEqual([]);
    expect(read.clips).toEqual([
      { ...WHERE, text: 'Gefolgt', clipped: { width: 8, height: 0 } },
      { ...WHERE, text: '(no text found)', clipped: { width: 8, height: 0 } },
    ]);
  });

  it('reads nothing of a screen that stayed in another language', async () => {
    vi.stubGlobal('__KROMA_UI__', fakeReader(clippedTree('Followed')));
    document.documentElement.lang = 'en';

    const read = await readScreen(new FakePage(), WHERE);

    expect(read).toEqual({ clips: [], unread: [{ ...WHERE, reason: 'it stayed in "en"' }] });
  });
});

describe('a screen the sweep could not read', () => {
  it.each([
    ['the first line of an error', new Error('page crashed\n    at stack'), 'page crashed'],
    ['anything else as it prints', 404, '404'],
  ])('says why with %s', (_case, reason, said) => {
    expect(unreadAt(WHERE, reason).unread).toEqual([{ ...WHERE, reason: said }]);
  });
});
