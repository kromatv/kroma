import { useT } from '@kroma/ui';
import { Box, Icon, Txt } from '@kroma/ui/kit';
import { CLIENT_BUILD } from '#tv/app/clientBuild';
import { useConnection } from '#tv/app/providers/connection';

// Non-blocking banner shown when the connected server is older than this client
// build requires (see @kroma/core `checkServerCompat`). Deliberately PASSIVE - it
// takes no D-pad focus and no pointer events, so it never disrupts navigation -
// and it clears itself the moment the server is updated.
//
// Drawn with the KIT rather than with a DOM element, because TvApp mounts this
// for every platform and that now includes the native TV clients: React Native
// has no `<output>` host component, no `position: fixed` and no CSSProperties,
// so an outdated server would have red-boxed the app on Apple TV instead of
// warning about itself. `accessibilityRole="alert"` keeps the live region the
// `<output>` was there for - react-native-web maps it to role="alert", which
// Blink has announced since well before the Chromium 53 engine of the legacy
// webOS tier.
//
// The warning sign is a GLYPH, not the "⚠" character: tvOS gives that code point
// emoji presentation, so the text version would draw a cartoon triangle on
// exactly the platform this rewrite is for - the same reason <Hint> takes its
// arrows from the icon set.

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
      <Txt style={LINE} color="#FFFFFF">
        {t('compat.serverOutdated', {
          server: serverVersion ?? '?',
          client: CLIENT_BUILD.version,
        })}
      </Txt>
    </Box>
  );
}

/** The amber of a warning that is not an error: the server still works. */
const WARN_BG = '#8A5A00';

const LINE = { fontSize: 17, fontWeight: '600' as const, textAlign: 'center' as const };
