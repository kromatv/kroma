import { useEffect, useState } from 'react';
import { Appearance, type StyleProp, type ViewStyle } from 'react-native';
import { SegmentedControl } from '#ui/components/molecules/segmented-control';
import { applyMode, readMode, type ThemeMode, writeMode } from '#ui/core/theme-mode';
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
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    const stored = readMode();
    setMode(stored);
    applyMode(stored);
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;
    const watch = Appearance.addChangeListener(() => applyMode('system'));
    return () => watch.remove();
  }, [mode]);

  return (
    <SegmentedControl.Root
      label={label}
      size={size}
      iconOnly
      value={mode}
      onValueChange={(next) => {
        setMode(next);
        writeMode(next);
      }}
      style={style}
    >
      {ORDER.map((value) => (
        <SegmentedControl.Item
          key={value}
          value={value}
          label={labels[value]}
          icon={GLYPH[value]}
        />
      ))}
    </SegmentedControl.Root>
  );
}
