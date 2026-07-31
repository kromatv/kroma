// Presentation for the profile-lock page: the titled section cards, the
// biometric switch row and the step-at-a-time masked PIN wizard. All state
// and auth calls stay in the route (app/(app)/profile-pin.tsx).

import { Button, Spinner, Switch, styles } from '@kroma/ui/kit';
import { Text, View } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { colors, radius, spacing, type } from '#mobile/lib/theme';
import { CodeCells } from './onboarding';
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
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>
        <Text style={s.sub}>{sub}</Text>
        {children}
      </View>
    </View>
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
    <View style={s.bioRow}>
      <Text style={s.bioLabel}>{label}</Text>
      <Switch checked={value} disabled={disabled} onChange={onChange} />
    </View>
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
    <View style={s.wizard}>
      <Text style={s.wizardSub}>{subtitle}</Text>
      <CodeCells value={pin} masked editable={!busy} onChange={onChange} />
      {busy ? <Spinner size={24} color={colors.textDim} /> : null}
      <ErrorBanner message={error} />
      <Button variant="glass" label={t('common.cancel')} onPress={onCancel} />
    </View>
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
