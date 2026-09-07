import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { outputName, render, renderTree } from './render';

let dir = '';

function template(): string {
  dir = mkdtempSync(join(tmpdir(), 'kroma-render-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '_gitignore'), 'dist\n');
  writeFileSync(join(dir, 'README.md'), '# __NAME__\n\n__DESCRIPTION__\n');
  writeFileSync(join(dir, 'src', '__PAGE__.tsx'), 'export function __PAGE__() {}\n');
  return dir;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('render', () => {
  it('replaces every placeholder it has a value for', () => {
    expect(render('__NAME__ is __ID__', { NAME: 'Notes', ID: 'tv.acme.notes' })).toBe(
      'Notes is tv.acme.notes',
    );
  });

  it('leaves an unknown key spelled out, so a template typo reaches the output', () => {
    expect(render('__NAME__ and __TYPO__', { NAME: 'Notes' })).toBe('Notes and __TYPO__');
  });
});

describe('outputName', () => {
  it('gives a leading underscore its dot back', () => {
    expect(outputName('_gitignore')).toBe('.gitignore');
  });

  it('leaves every other name as it is', () => {
    expect(outputName('module.json')).toBe('module.json');
  });
});

describe('renderTree', () => {
  it('renders a file name and its contents from the same vars', () => {
    const target = mkdtempSync(join(tmpdir(), 'kroma-render-out-'));

    const written = renderTree(template(), target, {
      NAME: 'Notes',
      DESCRIPTION: 'Jot things down',
      PAGE: 'NotesPage',
    });

    expect([...written].sort()).toEqual(['.gitignore', 'README.md', 'src/NotesPage.tsx']);
    expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('# Notes\n\nJot things down\n');
    expect(readFileSync(join(target, 'src', 'NotesPage.tsx'), 'utf8')).toBe(
      'export function NotesPage() {}\n',
    );
    rmSync(target, { recursive: true, force: true });
  });
});
