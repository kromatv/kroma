import { LinuxIcon } from '#site/components/download/linux-icon';
import { IconBrandApple, IconBrandWindows, IconChevronDown } from '@tabler/icons-react';
import { useState, useSyncExternalStore } from 'react';
import { DesktopFamily } from '#site/components/download/families/desktop';
import { family } from '#site/components/download/families/meta';
import { MobileFamily } from '#site/components/download/families/mobile';
import { NasFamily } from '#site/components/download/families/nas';
import { TvFamily } from '#site/components/download/families/tv';
import { guessPlatform } from '#site/lib/platform';
import { m } from '#site/paraglide/messages';

type Device = 'macos' | 'windows' | 'linux' | 'tv' | 'mobile' | 'nas';
const subscribeNever = () => () => undefined;
const clientDevice = (): Device => {
  const guess = guessPlatform(navigator.userAgent);
  if (!guess) return 'macos';
  if (guess.family !== 'desktop') return guess.family;
  if (guess.targets.includes('windows-exe')) return 'windows';
  if (guess.targets.includes('linux-appimage')) return 'linux';
  return 'macos';
};
const serverDevice = (): Device => 'macos';

/** A single focused download, with every other device one click away. */
export function AppPlatforms() {
  const detected = useSyncExternalStore(subscribeNever, clientDevice, serverDevice);
  const [chosen, setChosen] = useState<Device | null>(null);
  const selected = chosen ?? detected;
  const devices = [
    { id: 'macos', title: 'macOS', icon: IconBrandApple },
    { id: 'windows', title: 'Windows', icon: IconBrandWindows },
    { id: 'linux', title: 'Linux', icon: LinuxIcon },
    { ...family('tv'), id: 'tv' },
    { ...family('mobile'), id: 'mobile' },
    { ...family('nas'), id: 'nas' },
  ] as const;
  return (
    <div className="overflow-hidden rounded-3xl border border-border-strong bg-surface-1 shadow-card">
      <div className="border-b border-border bg-surface-2/35 p-3 sm:p-0">
        <div className="relative sm:hidden">
          <select
            aria-label={m.download_device_label()}
            value={selected}
            onChange={(event) => {
              const device = devices.find((item) => item.id === event.target.value);
              if (device) setChosen(device.id);
            }}
            className="w-full appearance-none rounded-xl border border-border bg-surface-1 py-3 pl-4 pr-10 text-sm font-semibold text-text"
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.title}
              </option>
            ))}
          </select>
          <IconChevronDown
            size={16}
            stroke={1.75}
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>
        <div
          role="group"
          aria-label={m.download_device_label()}
          className="hidden grid-cols-6 sm:grid"
        >
          {devices.map((device) => (
            <button
              key={device.id}
              type="button"
              aria-pressed={selected === device.id}
              aria-controls="download-platforms"
              onClick={() => setChosen(device.id)}
              className={`relative inline-flex min-w-0 items-center justify-center gap-2 px-2 py-4 text-xs font-semibold transition-colors lg:text-sm ${selected === device.id ? 'bg-surface-1 text-text after:absolute after:inset-x-5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent' : 'text-muted hover:bg-wash hover:text-text'}`}
            >
              <device.icon size={17} stroke={1.75} aria-hidden />
              {device.title}
            </button>
          ))}
        </div>
      </div>
      <div id="download-platforms">
        {selected === 'tv' && <TvFamily />}
        {selected === 'mobile' && <MobileFamily />}
        {selected === 'nas' && <NasFamily />}
        {(selected === 'macos' || selected === 'windows' || selected === 'linux') && (
          <DesktopFamily platform={selected} />
        )}
      </div>
    </div>
  );
}
