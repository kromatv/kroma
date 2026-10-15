import type { CapabilitySource } from '@kromatv/client/capabilities';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { FocusRegion } from '#ui/lib/focus-scope';
import { hasGlyph, type IconName } from '#ui/lib/glyph';
import { useT } from '#ui/services/i18n';

const glyphOf = (source: CapabilitySource): IconName =>
  source.icon && hasGlyph(source.icon) ? source.icon : 'download';

export function PreparationChoice({
  sources,
  onPick,
}: Readonly<{ sources: readonly CapabilitySource[]; onPick: (mount: string) => void }>) {
  const t = useT();
  return (
    <Box gap={16} align="center" w="100%">
      <Text variant="label" color="white">
        {t('requests.watchPickSource')}
      </Text>
      <FocusRegion style={s.row}>
        {sources.map((source, index) => (
          <Button
            key={source.mount}
            variant="glass"
            autoFocus={index === 0}
            icon={glyphOf(source)}
            label={source.label}
            onPress={() => onPick(source.mount)}
          />
        ))}
      </FocusRegion>
    </Box>
  );
}

const s = styles({
  row: { row: true, wrap: true, gap: 12, justify: 'center' },
});
