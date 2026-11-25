import type { BuildInfo } from 'virtual:build-info';
import type { Health } from '@kromatv/client/media';
import { commitLabel, formatBuildDate, repoLabel } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';

/** One line of a build card: what it is, and its value set in `mono` when it
 * is an identifier to copy rather than a word to read. */
export interface Fact {
  label: string;
  value: string;
  mono?: boolean;
}

type Candidate = Omit<Fact, 'value'> & { value: string | null | undefined };

const known = (facts: readonly Candidate[]): Fact[] =>
  facts.flatMap(({ value, ...rest }) => (value ? [{ ...rest, value }] : []));

function buildNumber(build: number | null | undefined, t: Translate): string {
  return build !== null && build !== undefined && build > 0 ? String(build) : t('about.localBuild');
}

/** What the server says about the build it runs, from `/api/health`. A field an
 * older server leaves out is left out here too. */
export function serverFacts(health: Health, t: Translate): Fact[] {
  return known([
    { label: t('about.version'), value: `v${health.version}` },
    { label: t('about.build'), value: buildNumber(health.build, t) },
    { label: t('about.commit'), value: health.commit, mono: true },
    { label: t('about.updateChannel'), value: health.updateChannel },
    {
      label: t('about.mediaAnalysis'),
      value: t(health.ffprobe ? 'about.mediaAnalysisReady' : 'about.mediaAnalysisMissing'),
    },
    { label: t('about.libraries'), value: String(health.libraries) },
  ]);
}

/** The build of this web client, from `virtual:build-info`. */
export function appFacts(info: BuildInfo, t: Translate, locale: string): Fact[] {
  return known([
    { label: t('about.version'), value: `v${info.version}` },
    { label: t('about.build'), value: buildNumber(info.build, t) },
    { label: t('about.commit'), value: commitLabel(info.commit, info.dirty), mono: true },
    { label: t('about.branch'), value: info.branch, mono: true },
    { label: t('about.buildDate'), value: formatBuildDate(info.buildDate, locale) },
    { label: t('about.repository'), value: repoLabel(info.repository) },
  ]);
}
