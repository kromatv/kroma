// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { clippedTree, FakePage, fakeReader } from './fake-page.fixture';
import { clippedTexts, settle, speaks } from './page-reader';

function placed(tag: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  document.body.append(element);
  return element;
}

function boxAt(element: Element, box: { x: number; y: number; width: number; height: number }) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...box,
    top: box.y,
    left: box.x,
    right: box.x + box.width,
    bottom: box.y + box.height,
    toJSON: () => box,
  });
}

describe('a page the sweep reads', () => {
  it('speaks the language asked for once its document says so', async () => {
    vi.stubGlobal('__KROMA_UI__', fakeReader(clippedTree()));
    document.documentElement.lang = 'de';

    expect(await speaks(new FakePage(), 'de')).toBeNull();
  });

  it('says the language it stayed in when it never speaks the one asked for', async () => {
    vi.stubGlobal('__KROMA_UI__', fakeReader(clippedTree()));
    document.documentElement.lang = 'de';

    expect(await speaks(new FakePage(), 'vi')).toBe('de');
  });

  it('settles once two reads of the screen in a row say the same', async () => {
    const reader = fakeReader(clippedTree(), ['a', 'b', 'b', 'c']);
    const read = vi.spyOn(reader, 'screenText');
    vi.stubGlobal('__KROMA_UI__', reader);

    await settle(new FakePage());

    expect(read).toHaveBeenCalledTimes(3);
  });

  it('gives up settling a screen that keeps changing', async () => {
    const texts = Array.from({ length: 20 }, (_, index) => String(index));
    const reader = fakeReader(clippedTree(), texts);
    const read = vi.spyOn(reader, 'screenText');
    vi.stubGlobal('__KROMA_UI__', reader);

    await settle(new FakePage());

    expect(read).toHaveBeenCalledTimes(12);
  });

  it('settles at once on a page that has no reader', async () => {
    vi.stubGlobal('__KROMA_UI__', undefined);
    const page = new FakePage();
    const wait = vi.spyOn(page, 'waitForTimeout');

    await settle(page);

    expect(wait).toHaveBeenCalledTimes(1);
  });
});

describe('the clipped texts of a page', () => {
  it('keep the text their props carry', async () => {
    vi.stubGlobal('__KROMA_UI__', fakeReader(clippedTree('Gefolgt')));

    const clips = await clippedTexts(new FakePage());

    expect(clips.map((clip) => clip.text)).toEqual(['Gefolgt']);
  });

  it('read a text its props do not carry off the element in its box', async () => {
    document.body.innerHTML = '';
    boxAt(placed('p', 'Elsewhere'), { x: 0, y: 0, width: 100, height: 20 });
    boxAt(placed('span', 'Laufzeit'), { x: 10, y: 20, width: 60, height: 20 });
    vi.stubGlobal('__KROMA_UI__', fakeReader(clippedTree('Gefolgt', null)));

    const clips = await clippedTexts(new FakePage());

    expect(clips.map((clip) => clip.text)).toEqual(['Gefolgt', 'Laufzeit']);
  });

  it('say nothing of a text no element sits in the box of', async () => {
    document.body.innerHTML = '';
    boxAt(placed('p', 'Elsewhere'), { x: 0, y: 0, width: 100, height: 20 });
    vi.stubGlobal('__KROMA_UI__', fakeReader(clippedTree(null)));

    const clips = await clippedTexts(new FakePage());

    expect(clips.map((clip) => clip.text)).toEqual([null]);
  });
});
