import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { useSyncExternalStore } from 'react';
import { readMode, subscribeMode, THEME_MODES, type ThemeMode, writeMode } from '#site/lib/theme';
import { m } from '#site/paraglide/messages';

const GLYPH = { system: IconDeviceDesktop, light: IconSun, dark: IconMoon } as const;

const serverMode = (): ThemeMode => 'system';

const label = (mode: ThemeMode) =>
  ({ system: m.theme_system(), light: m.theme_light(), dark: m.theme_dark() })[mode];

export function ThemeSwitcher({ className }: Readonly<{ className?: string }>) {
  const mode = useSyncExternalStore(subscribeMode, readMode, serverMode);

  return (
    <fieldset
      aria-label={m.theme_label()}
      className={['inline-flex items-center rounded-lg border border-border p-0.5', className]
        .filter(Boolean)
        .join(' ')}
    >
      {THEME_MODES.map((value) => {
        const Glyph = GLYPH[value];
        const isActive = value === mode;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            aria-label={label(value)}
            title={label(value)}
            onClick={() => {
              writeMode(value);
            }}
            className={[
              'flex size-7 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-accent text-accent-ink'
                : 'text-muted hover:text-text focus-visible:text-text',
            ].join(' ')}
          >
            <Glyph size={15} stroke={2} aria-hidden />
          </button>
        );
      })}
    </fieldset>
  );
}
