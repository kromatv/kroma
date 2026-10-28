import { canary, releases } from 'virtual:kroma-releases';
import { IconArrowLeft, IconChevronDown, IconSearch } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BuildRow } from '#site/components/archive/build-row';
import { CanaryRuns } from '#site/components/archive/canary-runs';
import { Container } from '#site/components/container';
import { docs } from '#site/components/download/links';
import { L } from '#site/components/localized-link';
import { fromDownload } from '#site/lib/build-file';
import { useDownloadChannelChoice } from '#site/components/download/channel';
import { getLocale } from '#site/lib/i18n';
import { TARGETS } from '#site/lib/release-targets';
import { useCanaryDownloads } from '#site/lib/use-canary-downloads';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/download_/archive')({
  head: () =>
    seo({
      lang: getLocale(),
      title: m.archive_head_title(),
      description: m.archive_hero_lead(),
      path: '/download/archive',
    }),
  component: Archive,
});

const PAGE_SIZE = 15;
const platforms = [...new Set(Object.values(TARGETS).map((target) => target.label))];

function Archive() {
  const { channel, choose: setChannel } = useDownloadChannelChoice();
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showRuns, setShowRuns] = useState(false);
  const rolling = useCanaryDownloads(canary, channel === 'canary');
  const builds =
    channel === 'stable'
      ? releases.map((release) => ({
          key: release.tag,
          version: release.version,
          at: release.publishedAt,
          downloads: release.downloads,
          notesUrl: release.notesUrl,
        }))
      : rolling.map((build) => ({
          key: `${build.version}-${build.builtAt}`,
          version: build.version ?? 'canary',
          at: build.builtAt,
          downloads: build.downloads,
          notesUrl: docs.releases,
        }));
  const rows = builds
    .filter((build) => build.version.toLowerCase().includes(query.trim().toLowerCase()))
    .map((build) => ({
      ...build,
      downloads: build.downloads.filter(
        (file) => !platform || TARGETS[file.target].label === platform,
      ),
    }))
    .filter((build) => build.downloads.length > 0);
  return (
    <section className="relative overflow-hidden pb-14 pt-8 sm:pb-20 sm:pt-12">
      <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-80 opacity-25" />
      <Container>
        <div className="relative mx-auto max-w-4xl">
          <L
            to="/download"
            className="inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-text"
          >
            <IconArrowLeft size={14} aria-hidden />
            {m.archive_back()}
          </L>
          <header className="mt-8 flex flex-wrap items-end justify-between gap-4 sm:mt-10">
            <div>
              <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-accent-text">
                {m.archive_eyebrow()}
              </p>
              <h1 className="font-display text-4xl font-extrabold tracking-tight text-text sm:text-5xl">
                {m.archive_hero_title()}
              </h1>
              <p className="mt-3 text-base leading-relaxed text-muted">{m.archive_hero_lead()}</p>
            </div>
            <a
              href={docs.releases}
              target="_blank"
              rel="noreferrer noopener"
              className="mb-1 text-xs text-muted transition-colors hover:text-accent-text"
            >
              {m.archive_on_github()} ↗
            </a>
          </header>
          <div className="mt-8 rounded-2xl border border-border bg-surface-1 p-3 sm:mt-9">
            <div className="flex flex-wrap items-center gap-3">
              <fieldset className="m-0 inline-flex min-w-0 shrink-0 rounded-xl border-0 bg-surface-2 p-1">
                <legend className="sr-only">{m.download_channel_label()}</legend>
                {(['stable', 'canary'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={channel === value}
                    onClick={() => {
                      setChannel(value);
                      setLimit(PAGE_SIZE);
                    }}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${channel === value ? 'bg-surface-3 text-text shadow-sm' : 'text-dim hover:text-text'}`}
                  >
                    {value === 'stable' ? m.download_channel_stable() : m.download_channel_canary()}
                  </button>
                ))}
              </fieldset>
              <label className="order-3 flex w-full min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-bg/50 px-3 transition-colors focus-within:border-accent sm:order-none sm:w-auto">
                <IconSearch size={16} className="shrink-0 text-dim" aria-hidden />
                <input
                  type="search"
                  aria-label={m.archive_search_label()}
                  placeholder={m.archive_search_hint()}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setLimit(PAGE_SIZE);
                  }}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-text placeholder:text-dim"
                />
              </label>
              <div className="relative ml-auto min-w-0 sm:ml-0">
                <select
                  aria-label={m.archive_platform_label()}
                  value={platform}
                  onChange={(event) => {
                    setPlatform(event.target.value);
                    setLimit(PAGE_SIZE);
                  }}
                  className="w-full appearance-none rounded-xl border border-border bg-surface-1 py-2.5 pl-3 pr-9 text-xs text-muted"
                >
                  <option value="">{m.archive_all_platforms()}</option>
                  {platforms.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
                <IconChevronDown
                  size={14}
                  stroke={1.75}
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>
            </div>
          </div>
          <div className="mb-3 mt-6 flex items-center justify-between px-1">
            <output className="text-xs text-dim">
              {m.archive_showing({
                showing: String(Math.min(limit, rows.length)),
                total: String(rows.length),
              })}
            </output>
            {channel === 'canary' && (
              <p className="text-xs text-dim">{m.download_channel_canary_note()}</p>
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-card">
            <div className="hidden grid-cols-[minmax(0,1fr)_14rem_6rem_1rem] gap-x-4 border-b border-border bg-surface-2/40 px-5 py-3 text-[0.62rem] font-semibold uppercase tracking-widest text-dim sm:grid">
              <span>{m.archive_column_version()}</span>
              <span>{m.archive_column_date()}</span>
              <span className="text-right">{m.archive_column_files()}</span>
              <span />
            </div>
            {rows.length === 0 && (
              <p className="px-5 py-12 text-center text-sm text-muted">{m.archive_no_match()}</p>
            )}
            {rows.slice(0, limit).map((build) => (
              <BuildRow
                key={`${channel}-${build.key}`}
                version={build.version}
                at={build.at}
                files={build.downloads.map(fromDownload)}
                source={{ href: build.notesUrl, label: m.download_release_notes() }}
                featured={build.key === builds[0]?.key}
              />
            ))}
          </div>
          {limit < rows.length && (
            <button
              type="button"
              onClick={() => setLimit((value) => value + PAGE_SIZE)}
              className="mt-5 w-full rounded-xl border border-border px-4 py-3 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:bg-wash hover:text-text"
            >
              {m.archive_load_more()}
            </button>
          )}
          {channel === 'canary' && (
            <details
              className="mt-7 border-t border-border pt-5"
              onToggle={(event) => setShowRuns(event.currentTarget.open)}
            >
              <summary className="cursor-pointer text-xs text-muted">
                {m.archive_ci_builds()}
              </summary>
              {showRuns && <CanaryRuns filter={{ query, label: platform || null }} />}
            </details>
          )}
        </div>
      </Container>
    </section>
  );
}
