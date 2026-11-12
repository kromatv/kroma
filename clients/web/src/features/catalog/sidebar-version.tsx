import buildInfo from 'virtual:build-info';
import { useT } from '@kromatv/ui';
import {
  Box,
  type CopyState,
  Focusable,
  Icon,
  type IconName,
  Row,
  styles,
  sv,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { copyText } from '#web/shared/lib/copy-text';
import { useDirectRoute } from '#web/shared/lib/direct-connection';
import { routeHost } from '#web/shared/lib/direct-offer';
import { clientStamp, serverStamp, stampLines, versionReport } from '#web/shared/lib/version-stamp';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const CLIENT = clientStamp(buildInfo);

const CONFIRM_MS = 1200;

const sDefinition = styles({
  tabular: { fontVariant: ['tabular-nums'] },
});

const triggerStyle = sv({
  base: {
    row: true,
    align: 'center',
    gap: 6,
    px: 6,
    py: 4,
    radius: 'sm',
    _hover: { bg: 'tint/4' },
    _focus: { bg: 'tint/4' },
    _press: { bg: 'tint/6' },
  },
});

const GLYPH: Record<CopyState, IconName> = {
  idle: 'copy',
  copied: 'check',
  failed: 'alert-triangle',
};

/** The build the sidebar is running and the server behind it, on one line
 *  when they are the same build and one line each when they are not, and the
 *  direct route when one is in use. Pressing it copies a report naming both
 *  builds, for a bug report. */
export function SidebarVersion() {
  const t = useT();
  const { route } = useDirectRoute();
  return (
    <>
      <VersionStamp />
      {route ? (
        <Box px={6}>
          <Text variant="meta" color="textDim" lines={1}>
            {t('connection.directRoute', { host: routeHost(route) })}
          </Text>
        </Box>
      ) : null}
    </>
  );
}

function VersionStamp() {
  const webRuntime = useWebRuntime();
  const t = useT();
  const s = useStyles(sDefinition);
  const [state, setState] = useState<CopyState>('idle');
  const { data: health } = useQuery(webRuntime.queries.serverQueries.health());

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const server = health ? serverStamp(health) : null;
  const lines = stampLines(CLIENT, server, t);
  const action = {
    idle: t('nav.versionCopy'),
    copied: t('common.copied'),
    failed: t('nav.versionCopyFailed'),
  }[state];
  const spoken = lines.map((line) => (line.side ? `${line.side} ${line.text}` : line.text));
  const copy = () => {
    void copyText(versionReport(CLIENT, server)).then((ok) => setState(ok ? 'copied' : 'failed'));
  };

  return (
    <span title={action}>
      <Focusable sv={triggerStyle} label={[...spoken, action].join(', ')} onPress={copy}>
        {({ hovered, focused }) => (
          <>
            <Box flex minW={0} gap={2}>
              {lines.map((line) => (
                <Row key={line.side ?? 'both'} gap={8}>
                  {line.side ? (
                    <Text variant="meta" color="textDim">
                      {line.side}
                    </Text>
                  ) : null}
                  <Text
                    variant="meta"
                    color="textDim"
                    lines={1}
                    flex
                    textAlign={line.side ? 'right' : undefined}
                    style={s.tabular}
                  >
                    {line.text}
                  </Text>
                </Row>
              ))}
            </Box>
            <Box w={12} shrink={0}>
              {hovered || focused || state !== 'idle' ? (
                <Icon name={GLYPH[state]} size={12} color="textDim" />
              ) : null}
            </Box>
          </>
        )}
      </Focusable>
    </span>
  );
}
