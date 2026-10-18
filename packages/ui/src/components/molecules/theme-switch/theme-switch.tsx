import { useEffect, useState } from 'react';
import { Appearance, type StyleProp, type ViewStyle } from 'react-native';
import { SegmentGroup } from '#ui/components/molecules/segment-group';
import { useStyleRuntime } from '#ui/core/style-context';
import { applyMode, readMode, type ThemeMode, writeMode } from '#ui/core/theme-mode';
import { useDeviceStore } from '#ui/lib/device-store';
import type { ControlSize } from '#ui/lib/field-shell';

export interface ThemeSwitchProps {
  size?: ControlSize;
  /** Accessible name of the group. Defaults to the product's French. */
  label?: string;
  /** Accessible names of the three modes, since the glyphs carry no words.
   *  Defaults to the product's French. */
  labels?: Readonly<Record<ThemeMode, string>>;
  style?: StyleProp<ViewStyle>;
}

const FR: Record<ThemeMode, string> = { system: 'Système', light: 'Clair', dark: 'Sombre' };

const GLYPH = { system: 'device-desktop', light: 'sun', dark: 'moon' } as const;

const ORDER: readonly ThemeMode[] = ['system', 'light', 'dark'];

/**
 * Dark / light / system, persisted where the platform can act on it: a cookie
 * on the web, so the server renders the chosen ground, and the device store on
 * a native target. The stored mode is read in an effect, not during render, or
 * the server and the client disagree and hydration warns.
 */
export function ThemeSwitch({
  size = 'sm',
  label = 'Thème',
  labels = FR,
  style,
}: Readonly<ThemeSwitchProps>) {
  const runtime = useStyleRuntime();
  const store = useDeviceStore();
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    const stored = readMode(undefined, store);
    setMode(stored);
    applyMode(stored, runtime);
  }, [runtime, store]);

  useEffect(() => {
    if (mode !== 'system') return;
    const watch = Appearance.addChangeListener(() => applyMode('system', runtime));
    return () => watch.remove();
  }, [mode, runtime]);

  return (
    <SegmentGroup.Root
      label={label}
      size={size}
      value={mode}
      onValueChange={(next) => {
        setMode(next);
        writeMode(next, runtime, store);
      }}
      style={style}
    >
      {ORDER.map((value) => (
        <SegmentGroup.Item key={value} value={value} label={labels[value]} icon={GLYPH[value]} />
      ))}
    </SegmentGroup.Root>
  );
}
