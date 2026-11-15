import { afterEach, describe, expect, it } from 'vitest';
import { moduleOf, read, removeSets, setOf } from './fixture.ts';
import { noteFor, readNotes, strayNotes, writeNote } from './notes.ts';
import { localesOf } from './set.ts';
import { readSource } from './status.ts';
import { todo } from './todo.ts';

afterEach(removeSets);

const FILES = {
  'fr/player.json': { 'player.play': 'Lecture', 'player.pause': 'Pause' },
  'notes.json': {
    '*': 'KROMA is a media server. Address the reader informally.',
    'player.': 'Buttons of the video player.',
    'player.play': 'A verb, on the button that starts playback.',
  },
};

describe('noteFor', () => {
  it('gives the note for every message, then each prefix, then the message itself', () => {
    const notes = readNotes(setOf(FILES));

    expect(noteFor(notes, 'player.play')).toBe(
      'KROMA is a media server. Address the reader informally.\nButtons of the video player.\nA verb, on the button that starts playback.',
    );
  });

  it('is nothing where nobody wrote anything', () => {
    expect(noteFor(new Map(), 'player.play')).toBeUndefined();
  });
});

describe('strayNotes', () => {
  it('names the notes about a key or a prefix that no message has', () => {
    const set = setOf({
      ...FILES,
      'notes.json': { 'player.gone': 'x', 'cart.': 'y', 'player.': 'z' },
    });

    expect(strayNotes(readNotes(set), readSource(set))).toEqual(['player.gone', 'cart.']);
  });
});

describe('writeNote', () => {
  it('writes a note and removes it again with an empty text', () => {
    const set = setOf(FILES);

    writeNote(set, 'player.pause', 'A verb.');
    writeNote(set, 'player.play', '');

    expect(Object.keys(read(set, 'notes.json'))).toEqual(['*', 'player.', 'player.pause']);
  });

  it('keeps the notes of a folder module beside its language folders, where none is a language', () => {
    const set = moduleOf({ 'locales/en/nav.json': { 'nav.title': 'Notes' } });

    writeNote(set, 'nav.title', 'The name of the page.');

    expect(read(set, 'notes.json')).toEqual({ 'nav.title': 'The name of the page.' });
    expect(todo(set, 'fr')['nav.title']?.note).toBe('The name of the page.');
    expect(localesOf(set)).toEqual(['en']);
  });

  it('refuses a set that keeps one file per language', () => {
    const set = setOf({ 'en.json': {} }, { source: 'en' }, 'flat');

    expect(() => writeNote(set, 'a', 'b')).toThrow('no notes');
  });
});

describe('todo', () => {
  it('hands the translator the notes with the message', () => {
    const set = setOf(FILES);

    expect(todo(set, 'de')['player.pause']?.note).toContain('Buttons of the video player.');
  });
});
