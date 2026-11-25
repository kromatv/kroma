import type { BuildInfo } from 'virtual:build-info';
import type { Health } from '@kromatv/client/media';
import type { Translate } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import { appFacts, serverFacts } from './build-facts';

const t: Translate = (key: string, _vars?: unknown) => key;

const HEALTH: Health = {
  status: 'ok',
  name: 'Den',
  version: '0.1.39',
  build: 3488516,
  commit: '74f8960',
  ffprobe: true,
  libraries: 3,
  items: 1200,
  shows: 80,
  updateChannel: 'stable',
};

const INFO: BuildInfo = {
  version: '0.1.39',
  build: null,
  commit: 'abc1234',
  commitFull: 'abc1234def',
  branch: 'main',
  dirty: true,
  buildDate: 'not a date',
  repository: 'https://github.com/kromatv/kroma',
};

describe('serverFacts', () => {
  it('lists the build the server runs, and whether it can analyse files', () => {
    const facts = serverFacts(HEALTH, t);

    expect(facts.map((fact) => [fact.label, fact.value])).toEqual([
      ['about.version', 'v0.1.39'],
      ['about.build', '3488516'],
      ['about.commit', '74f8960'],
      ['about.updateChannel', 'stable'],
      ['about.mediaAnalysis', 'about.mediaAnalysisReady'],
      ['about.libraries', '3'],
    ]);
  });

  it('leaves out what an older server does not send, and names a local build', () => {
    const older: Health = { ...HEALTH, build: 0, commit: undefined, updateChannel: undefined };

    const facts = serverFacts({ ...older, ffprobe: false }, t);

    expect(facts.map((fact) => fact.value)).toEqual([
      'v0.1.39',
      'about.localBuild',
      'about.mediaAnalysisMissing',
      '3',
    ]);
  });
});

describe('appFacts', () => {
  it('lists the build of this client, marking a dirty tree', () => {
    const facts = appFacts(INFO, t, 'en');

    expect(facts).toEqual([
      { label: 'about.version', value: 'v0.1.39' },
      { label: 'about.build', value: 'about.localBuild' },
      { label: 'about.commit', value: 'abc1234-dirty', mono: true },
      { label: 'about.branch', value: 'main', mono: true },
      { label: 'about.buildDate', value: 'not a date' },
      { label: 'about.repository', value: 'github.com/kromatv/kroma' },
    ]);
  });
});
