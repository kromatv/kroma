// The list of interface languages, with the current one ticked. Both places a
// phone offers the choice draw this: the gate's gear sheet, which can only set
// the device override, and the settings screen, which also syncs it to the
// account. They differ in what a pick DOES, which is the prop, and in nothing
// else.

import { LOCALES, type Locale } from '@kroma/core';
import { Box, Icon, styles, Txt } from '@kroma/ui/kit';
import { Pressable } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

export function LocalePicker({
  locale,
  onPick,
}: Readonly<{ locale: string; onPick: (next: Locale) => void }>) {
  const t = useT();
  return (
    <Box style={s.card}>
      {LOCALES.map((l) => (
        <Pressable
          key={l.code}
          onPress={() => onPick(l.code as Locale)}
          style={({ pressed }) => [s.row, pressed && s.rowPressed]}
        >
          <Txt style={[s.rowLabel, locale === l.code && { fontWeight: '700' }]}>
            {t(l.labelKey)}
          </Txt>
          {locale === l.code ? (
            <Icon name="check" size={17} stroke={2.4} color={colors.accent} />
          ) : null}
        </Pressable>
      ))}
    </Box>
  );
}

const s = styles({
  card: { px: 6, py: 4, bg: 'surface1', radius: radius.lg },
  row: { row: true, between: true, align: 'center', minH: 52, px: spacing.sm, radius: radius.md },
  rowPressed: { bg: 'surface2' },
  rowLabel: { ...type.body },
});
