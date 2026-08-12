// Presentation for the profile-lock page: the titled section cards, the
// biometric switch row and the step-at-a-time masked PIN wizard. All state
// and auth calls stay in the route (app/(app)/profile-pin.tsx).

import { Box, Button, Keypad, OtpField, Spinner, Switch, styles, Text } from '@kroma/ui/kit';
import { useT } from '#mobile/lib/i18n';
import { radius, spacing, type } from '#mobile/lib/theme';
import { ErrorBanner } from './ui';

export function LockCard({
  title,
  sub,
  children,
}: Readonly<{
  title: string;
  sub: string;
  children: React.ReactNode;
}>) {
  return (
    <Box style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Box style={s.card}>
        <Text style={s.sub}>{sub}</Text>
        {children}
      </Box>
    </Box>
  );
}

export function BioSwitchRow({
  label,
  value,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  value: boolean;
  disabled: boolean;
  onChange(next: boolean): void;
}>) {
  return (
    <Box style={s.bioRow}>
      <Text style={s.bioLabel}>{label}</Text>
      <Switch checked={value} disabled={disabled} onCheckedChange={onChange} />
    </Box>
  );
}

/** One masked 4-digit entry step; the parent advances on the fourth digit. */
export function PinWizard({
  subtitle,
  pin,
  busy,
  error,
  onChange,
  onCancel,
}: Readonly<{
  subtitle: string;
  pin: string;
  busy: boolean;
  error: string | null;
  onChange(next: string): void;
  onCancel(): void;
}>) {
  const t = useT();
  return (
    <Box style={s.wizard}>
      <Text style={s.wizardSub}>{subtitle}</Text>
      {/* The kit's own pad, like <ConnectDevice>: it taps back, it cannot be
          cropped by a system keyboard, and iOS puts no AutoFill chip over it. */}
      <OtpField.Root
        self="center"
        maxLength={4}
        value={pin}
        onValueChange={onChange}
        mask
        disabled={busy}
      />
      <Box self="center">
        <Keypad
          size="compact"
          autoFocus={false}
          disabled={busy}
          onDigit={(digit) => onChange(pin + digit)}
          onDelete={() => onChange(pin.slice(0, -1))}
        />
      </Box>
      {busy ? (
        <Box self="center">
          <Spinner size={24} color="textMuted" />
        </Box>
      ) : null}
      <ErrorBanner message={error} />
      <Button variant="glass" label={t('common.cancel')} onPress={onCancel} />
    </Box>
  );
}

const s = styles({
  section: { gap: spacing.xs },
  sectionTitle: { ...type.small, mb: 2, textTransform: 'uppercase', letterSpacing: 1 },
  card: { gap: spacing.md, p: spacing.md, bg: 'surface1', radius: radius.md, border: 'border' },
  sub: { ...type.caption },
  bioRow: { row: true, between: true, align: 'center', gap: spacing.md },
  bioLabel: { ...type.body, shrink: 1, fontWeight: '500' },
  wizard: { gap: spacing.lg, p: spacing.md, pt: spacing.xl },
  wizardSub: { ...type.body, textAlign: 'center', color: 'textMuted' },
});
