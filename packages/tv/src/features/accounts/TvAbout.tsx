import { commitLabel, formatBuildDate, repoLabel } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Box, Hint, ListRow, styles, Txt, useFocusNav } from '@kroma/ui/kit';
import { Platform } from 'react-native';
import { buildInfo } from '#tv/app/clientBuild';
import { useNav } from '#tv/app/router';
import { AuthScreen, GATE_MARK, KromaMark } from '#tv/shared/ui';

/**
 * About (route `about`): which build of the client is running.
 *
 * The fact rows are disabled, taking them out of the focus graph — a remote
 * that walks through five dead rows to reach the only live one is worse than
 * one that lands on it directly. Back stays the sole focus target.
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
        <KromaMark size={GATE_MARK} />
      </Box>
      <Txt
        variant="hero"
        style={{ fontSize: 44, lineHeight: 44, fontWeight: '600', marginBottom: 36 }}
      >
        {t('about.title')}
      </Txt>

      <Box w="100%" maxW={560} gap={12}>
        <Fact label={t('about.version')} value={`v${build.version}`} />
        {/* A build outside a git checkout has no commit to name; Fact hides
            the row rather than show an empty value. */}
        <Fact label={t('about.commit')} value={commitLabel(build.commit, build.dirty)} mono />
        <Fact label={t('about.branch')} value={build.branch} mono />
        <Fact label={t('about.buildDate')} value={formatBuildDate(build.buildDate, locale)} />
        <Fact label={t('about.repository')} value={repoLabel(build.repository)} />
        {/* Both TV stores require the privacy policy readable in-app, not only
            on the listing — a television can't open a browser to go read it. */}
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
        <Txt color="textDim" style={mono ? s.monoValue : s.value}>
          {value}
        </Txt>
      }
    />
  );
}

const s = styles({
  value: { fontSize: 16, fontWeight: '600' },
  // Native takes one font family name (a CSS-style list resolves to nothing
  // and silently falls back); the browser shells take the list.
  monoValue: {
    fontSize: 16,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: "ui-monospace, 'SF Mono', Menlo, monospace",
    }),
  },
});
