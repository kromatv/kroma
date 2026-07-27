// Presentation for the profile-lock page: the titled section cards, the
// biometric switch row and the step-at-a-time masked PIN wizard. All state
// and auth calls stay in the route (app/(app)/profile-pin.tsx).

import { Button, Spinner, Switch } from '@kroma/ui/kit';
import { StyleSheet, Text, View } from 'react-native';
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
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        <Text style={styles.sub}>{sub}</Text>
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
    <View style={styles.bioRow}>
      <Text style={styles.bioLabel}>{label}</Text>
      {/* The KIT's switch - same amber track and animated flip as every other
          surface - in place of the OS one this row used to style by hand. */}
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
    <View style={styles.wizard}>
      <Text style={styles.wizardSub}>{subtitle}</Text>
      <CodeCells value={pin} masked editable={!busy} onChange={onChange} />
      {busy ? <Spinner size={24} color={colors.textDim} /> : null}
      <ErrorBanner message={error} />
      <Button variant="glass" label={t('common.cancel')} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  sectionTitle: {
    ...type.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  sub: { ...type.caption },
  bioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bioLabel: { ...type.body, fontWeight: '500', flexShrink: 1 },
  wizard: { padding: spacing.md, paddingTop: spacing.xl, gap: spacing.lg },
  wizardSub: { ...type.body, textAlign: 'center', color: colors.textDim },
});
