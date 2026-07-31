import { useT } from '@kroma/ui';
import { Box, Icon, styles, Txt } from '@kroma/ui/kit';
import { CLIENT_BUILD } from '#tv/app/clientBuild';
import { useConnection } from '#tv/app/providers/connection';

// Drawn with the KIT, not a DOM element: React Native has no `<output>` host
// component or `position: fixed`, which would red-box the native TV clients.
// The warning sign is a glyph, not "⚠", which tvOS renders as emoji.

export function CompatBanner() {
  const { compat, serverVersion } = useConnection();
  const t = useT();
  if (compat !== 'server-outdated') return null;
  return (
    <Box
      absolute
      top={0}
      left={0}
      right={0}
      z={9999}
      row
      center
      gap={10}
      px={24}
      py={10}
      bg={WARN_BG}
      pointerEvents="none"
      accessibilityRole="alert"
    >
      <Icon name="alert-triangle" size={22} color="#FFFFFF" />
      <Txt style={s.line} color="#FFFFFF">
        {t('compat.serverOutdated', {
          server: serverVersion ?? '?',
          client: CLIENT_BUILD.version,
        })}
      </Txt>
    </Box>
  );
}

const WARN_BG = '#8A5A00';

const s = styles({
  line: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
});
