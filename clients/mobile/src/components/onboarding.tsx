// Onboarding building blocks shared by the sign-in, connect and connect-device
// screens: profile tiles for the "Who's watching?" gate and the segmented
// code cells (PIN pad, Quick Connect code).

import { Icon, Spinner, styles } from '@kroma/ui/kit';
import { useRef } from 'react';
import { Pressable, type ReturnKeyTypeOptions, Text, TextInput, View } from 'react-native';
import { colors, radius, type } from '#mobile/lib/theme';
import { Avatar } from './Avatar';

const TILE_AVATAR = 84;

export function ProfileTile({
  name,
  caption,
  avatarUri,
  busy,
  disabled,
  offline,
  locked,
  onPress,
}: Readonly<{
  name: string;
  caption?: string | null;
  avatarUri: string | null;
  busy?: boolean;
  disabled?: boolean;
  offline?: boolean;
  locked?: boolean;
  onPress(): void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || offline}
      style={({ pressed }) => [s.tile, (pressed || offline) && { opacity: 0.6 }]}
    >
      <View>
        <Avatar uri={avatarUri} name={name} size={TILE_AVATAR} />
        {locked && !busy ? (
          <View style={s.lockBadge}>
            <Icon name="lock" size={13} stroke={2.2} color={colors.text} />
          </View>
        ) : null}
        {busy ? (
          <View style={s.tileBusy}>
            <Spinner size={24} color={colors.text} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={s.tileName}>
        {name}
      </Text>
      {caption ? (
        <Text numberOfLines={1} style={[s.tileCaption, offline && { color: colors.danger }]}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function AddTile({ label, onPress }: Readonly<{ label: string; onPress(): void }>) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, pressed && { opacity: 0.6 }]}>
      <View style={s.addCircle}>
        <Icon name="plus" size={30} stroke={2.2} color={colors.textDim} />
      </View>
      <Text numberOfLines={1} style={[s.tileName, { color: colors.textDim }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function cellText(value: string, i: number, masked: boolean): string {
  if (i >= value.length) return '';
  return masked ? '•' : (value[i] ?? '');
}

/** Segmented digit cells over a hidden input; the keyboard stays up and the
 * parent auto-submits once `value` reaches `length`. `masked` renders dots
 * (PIN entry); otherwise the digits show (Quick Connect codes). */
export function CodeCells({
  value,
  onChange,
  length = 4,
  masked = false,
  error = false,
  showActive = true,
  editable = true,
  refocusOnBlur = false,
}: Readonly<{
  value: string;
  onChange(next: string): void;
  length?: number;
  masked?: boolean;
  error?: boolean;
  showActive?: boolean;
  editable?: boolean;
  refocusOnBlur?: boolean;
}>) {
  const inputRef = useRef<TextInput>(null);
  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={s.pinRow}>
      {Array.from({ length }, (_, i) => (
        <View
          key={`cell-${String(i)}`}
          style={[
            s.pinCell,
            showActive && i === value.length && s.pinCellActive,
            error && s.pinCellError,
          ]}
        >
          <Text style={s.pinDigit}>{cellText(value, i, masked)}</Text>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(raw) => onChange(raw.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus
        editable={editable}
        // Opt out of AutoFill: this is a local PIN, and the code comes off the
        // TV's own screen, never an SMS.
        textContentType="none"
        autoComplete="off"
        // tvOS's RN fork adds a keyboard accessory toolbar whenever the return
        // key type is the default, titled after the enum ("Default"); `continue`
        // is the one value it renders without a toolbar. The cast is for the
        // fork's `.d.ts`, whose union omits `continue` — the runtime (and
        // upstream's types) support it.
        returnKeyType={'continue' as unknown as ReturnKeyTypeOptions}
        onBlur={() => {
          if (refocusOnBlur) inputRef.current?.focus();
        }}
        style={s.pinInput}
        caretHidden
      />
    </Pressable>
  );
}

/** Four masked digit cells for PIN-locked profiles. */
export function PinPad({
  value,
  onChange,
  length = 4,
  disabled,
}: Readonly<{
  value: string;
  onChange(next: string): void;
  length?: number;
  disabled?: boolean;
}>) {
  return (
    <CodeCells value={value} onChange={onChange} length={length} masked editable={!disabled} />
  );
}

const s = styles({
  tile: { align: 'center', gap: 6, w: 96 },
  tileBusy: {
    absolute: true,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    center: true,
    bg: 'bg/55',
    radius: TILE_AVATAR / 2,
  },
  lockBadge: {
    absolute: true,
    right: -2,
    bottom: -2,
    center: true,
    w: 26,
    h: 26,
    bg: 'surface3',
    radius: 13,
    border: 'bg',
    borderWidth: 2.5,
  },
  tileName: { ...type.caption, mt: 2, color: 'text', fontWeight: '600' },
  tileCaption: { ...type.small, mt: -2 },
  addCircle: {
    center: true,
    w: TILE_AVATAR,
    h: TILE_AVATAR,
    radius: TILE_AVATAR / 2,
    border: 'borderStrong',
    borderWidth: 1.5,
  },
  pinRow: { row: true, justify: 'center', gap: 12 },
  pinCell: {
    center: true,
    w: 52,
    h: 60,
    bg: 'surface1',
    radius: radius.md,
    border: 'borderStrong',
    borderWidth: 1.5,
  },
  pinCellActive: { borderColor: 'accent' },
  pinCellError: { borderColor: 'danger' },
  pinDigit: { fontSize: 30, color: 'text', fontWeight: '800' },
  pinInput: { absolute: true, w: 1, h: 1, opacity: 0 },
});
