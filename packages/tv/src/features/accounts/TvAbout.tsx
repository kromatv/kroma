import { commitLabel, formatBuildDate, repoLabel } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Box, Hint, ListRow, Txt, useFocusNav } from '@kroma/ui/kit';
import { Platform } from 'react-native';
import { buildInfo } from '#tv/app/clientBuild';
import { useNav } from '#tv/app/router';
import { AuthScreen, KromaMark } from '#tv/shared/ui';

/**
 * About (route `about`): which build of the client is running, reachable from
 * device settings and from the profile menu.
 *
 * It answers the question a bug report starts with. The version alone never did:
 * every TV shell ships the same version string, so "v0.1.33" does not say which
 * commit, from which branch, built when - and on a television there is no
 * `--version` to fall back on and no way to look.
 *
 * The fact rows are DISABLED, which takes them out of the focus graph entirely:
 * there is nothing here to activate, and a remote that walks through five dead
 * rows to reach the only live one is worse than one that lands on it. That
 * single live row is Back, so the D-pad always has a target - a screen with no
 * focus node at all leaves the remote doing nothing, which is indistinguishable
 * from a frozen app.
 */
export function TvAbout() {
  const nav = useNav();
  const t = useT();
  const locale = useLocale();
  const build = buildInfo();
  useFocusNav({ onBack: nav.back });

  return (
    <AuthScreen>
      <Box mb={32}>
        <KromaMark size={40} />
      </Box>
      <Txt
        variant="hero"
        style={{ fontSize: 44, lineHeight: 44, fontWeight: '600', marginBottom: 36 }}
      >
        {t('about.title')}
      </Txt>

      <Box w="100%" maxW={560} gap={12}>
        <Fact label={t('about.version')} value={`v${build.version}`} />
        {/* Each row is its own value's guard: a build made outside a git
            checkout (a source tarball) has no commit to name, and an empty row
            would say less than no row at all. */}
        <Fact label={t('about.commit')} value={commitLabel(build.commit, build.dirty)} mono />
        <Fact label={t('about.branch')} value={build.branch} mono />
        <Fact label={t('about.buildDate')} value={formatBuildDate(build.buildDate, locale)} />
        <Fact label={t('about.repository')} value={repoLabel(build.repository)} />
        {/* Both TV stores require the privacy policy to be readable IN the app,
            not only on the listing - and a television cannot open a browser to
            go and read it. So the substance is stated here (it is short, because
            the app genuinely collects nothing) with the address of the full text
            for anyone who wants it. Not a focus target: there is nothing to
            activate, exactly like the fact rows above. */}
        <Box mt={20}>
          <Txt variant="label" color="textMuted" style={{ marginBottom: 6 }}>
            {t('about.privacyTitle')}
          </Txt>
          <Txt color="textMuted" style={{ fontSize: 16, lineHeight: 24 }}>
            {t('about.privacyBody')}
          </Txt>
          <Txt color="textDim" style={{ fontSize: 16, lineHeight: 24, marginTop: 6 }}>
            {t('about.privacyUrl')}
          </Txt>
        </Box>
        <ListRow icon="arrow-left" label={t('common.back')} autoFocus onPress={nav.back} />
      </Box>

      <Hint
        text={t('profileMenu.navHint')}
        size={14}
        gap={4}
        mt={28}
        color="rgba(244, 243, 240, 0.4)"
        textStyle={{ fontWeight: '500' }}
      />
    </AuthScreen>
  );
}

/** One read-only line. Renders nothing without a value. */
function Fact({
  label,
  value,
  mono,
}: Readonly<{ label: string; value: string | null; mono?: boolean }>) {
  if (!value) return null;
  return (
    <ListRow
      disabled
      label={label}
      trailing={
        <Txt color="textDim" style={mono ? MONO_VALUE : VALUE}>
          {value}
        </Txt>
      }
    />
  );
}

const VALUE = { fontSize: 16, fontWeight: '600' as const };
/** A hash and a branch name are strings to COMPARE, not to read as prose. Native
 * takes ONE family name (a CSS-style list resolves to nothing and silently falls
 * back); the browser shells take the list. */
const MONO_VALUE = {
  fontSize: 16,
  fontFamily: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: "ui-monospace, 'SF Mono', Menlo, monospace",
  }),
};
