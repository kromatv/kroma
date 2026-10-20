import { canary, release } from 'virtual:kroma-releases';
import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from 'react';
import { canaryRelease, type DownloadChannel, channelFromSearch } from '#site/lib/download-channel';
import type { SiteRelease } from '#site/lib/releases';
import { m } from '#site/paraglide/messages';

interface ChannelState {
  channel: DownloadChannel;
  release: SiteRelease | null;
  choose: (channel: DownloadChannel) => void;
}

const CHANGED = 'kroma:download-channel';

const subscribe = (notify: () => void) => {
  globalThis.addEventListener('popstate', notify);
  globalThis.addEventListener(CHANGED, notify);
  return () => {
    globalThis.removeEventListener('popstate', notify);
    globalThis.removeEventListener(CHANGED, notify);
  };
};
const clientChannel = (): DownloadChannel =>
  canary.length > 0 ? channelFromSearch(globalThis.location.search) : 'stable';
const serverChannel = (): DownloadChannel => 'stable';

const choose = (next: DownloadChannel) => {
  const url = new URL(globalThis.location.href);
  if (next === 'canary') url.searchParams.set('channel', 'canary');
  else url.searchParams.delete('channel');
  globalThis.history.replaceState(globalThis.history.state, '', url);
  globalThis.dispatchEvent(new Event(CHANGED));
};

const ChannelContext = createContext<ChannelState>({
  channel: 'stable',
  release,
  choose: () => undefined,
});

/**
 * Which channel the page hands over. Stable during the prerender and the first
 * paint, then whatever `?channel=` asks for: the page is built once for every
 * reader, so the query can only be read after mount.
 */
export function DownloadChannelProvider({ children }: Readonly<{ children: ReactNode }>) {
  const channel = useSyncExternalStore(subscribe, clientChannel, serverChannel);
  const value = useMemo<ChannelState>(
    () => ({ channel, release: channel === 'canary' ? canaryRelease(canary) : release, choose }),
    [channel],
  );
  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>;
}

/** The release the buttons below the toggle hand over. */
export const useDownloadRelease = () => useContext(ChannelContext).release;

/** The channel the reader chose. */
export const useDownloadChannel = () => useContext(ChannelContext).channel;

/** Stable or canary, with what canary costs said beside it. Absent when CI published no canary. */
export function ChannelToggle() {
  const { channel, choose } = useContext(ChannelContext);
  if (canary.length === 0) return null;

  return (
    <div className="mt-6">
      <div
        role="radiogroup"
        aria-label={m.download_channel_label()}
        className="inline-flex rounded-full border border-border bg-surface-1/60 p-1"
      >
        <Option active={channel === 'stable'} onSelect={() => choose('stable')}>
          {m.download_channel_stable()}
        </Option>
        <Option active={channel === 'canary'} onSelect={() => choose('canary')}>
          {m.download_channel_canary()}
        </Option>
      </div>
      {channel === 'canary' && (
        <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted">
          {m.download_channel_canary_note()}
        </p>
      )}
    </div>
  );
}

function Option({
  active,
  onSelect,
  children,
}: Readonly<{ active: boolean; onSelect: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={[
        'rounded-full px-4 py-1.5 font-sans text-sm font-semibold transition-colors',
        active ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text focus-visible:text-text',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
