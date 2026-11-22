import { Importer, ImportServerId, ImportSignInId } from '@kromatv/client/importers';
import { ImportId } from '@kromatv/client/imports';
import { ModuleId } from '@kromatv/client/modules';
import { describe, expect, it } from 'vitest';
import type { ImportChoices } from './import-session.component';
import { importStage, stageChoices, stagesBehind } from './import-stage';

const PLEX = ModuleId.parse('tv.test.plex');
const SIGN_IN = ImportSignInId.parse(crypto.randomUUID());
const DEN = ImportServerId.parse('den');

const NOTHING: ImportChoices = {
  importer: null,
  signIn: null,
  servers: [],
  server: null,
  skippedLibraries: [],
  skippedUsers: [],
  folders: [],
  running: null,
};

const CHOSEN = { ...NOTHING, importer: PLEX };
const SIGNED_IN = { ...CHOSEN, signIn: SIGN_IN, servers: [{ id: DEN, name: 'The den' }] };
const PICKED = { ...SIGNED_IN, server: DEN };

const READY = Importer.parse({
  id: PLEX,
  name: 'Plex import',
  label: 'Plex',
  installed: true,
  running: true,
  fields: [],
});

const OFFERED = Importer.parse({ ...READY, installed: false, running: false });

describe('where an import stands', () => {
  it('starts at the choice of a server', () => {
    expect(importStage(NOTHING, null)).toBe('source');
  });

  it('stays at the choice of a server while the chosen importer is not listed', () => {
    expect(importStage(CHOSEN, null)).toBe('source');
  });

  it('counts the consent to an importer as part of the sign-in', () => {
    expect(importStage(CHOSEN, OFFERED)).toBe('connect');
  });

  it('counts the choice among several servers as part of the sign-in', () => {
    expect(importStage(SIGNED_IN, READY)).toBe('connect');
  });

  it('reviews once a server is picked', () => {
    expect(importStage(PICKED, READY)).toBe('review');
  });

  it('runs once the import has started, whatever else the session holds', () => {
    const running = { ...NOTHING, running: ImportId.parse(crypto.randomUUID()) };

    expect(importStage(running, null)).toBe('run');
  });
});

describe('the stretches behind the owner', () => {
  it('are none at the start', () => {
    expect(stagesBehind('source')).toEqual([]);
  });

  it('are every stretch before the one the owner is in', () => {
    expect(stagesBehind('review')).toEqual(['source', 'connect']);
  });
});

describe('what the owner chose', () => {
  it('names the server they come from by its label', () => {
    expect(stageChoices(CHOSEN, READY).source).toBe('Plex');
  });

  it('names the server they bring over once it is picked', () => {
    expect(stageChoices(PICKED, READY).connect).toBe('The den');
  });

  it('names nothing before a choice is made', () => {
    expect(stageChoices(SIGNED_IN, null)).toEqual({ source: undefined, connect: undefined });
  });
});
