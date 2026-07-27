import { type ResolvedOrigin, resolveServerOrigin } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, Field, Hint, Icon, type IconName, Txt, useFocusNav } from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useEnv } from '#tv/app/providers/env';
import { useNav } from '#tv/app/router';
import { AuthScreen, KromaMark, OnScreenKeyboard } from '#tv/shared/ui';

/**
 * Add a (distant) server by address, via an on-screen URL keyboard. Reached on
 * first run (no server saved) and from the add-profile wizard's "Add manually".
 * On submit the server is upserted and the flow advances to Quick Connect. A
 * Detect button kicks off LAN discovery and prefills the field.
 */
export function TvConnect() {
  const nav = useNav();
  const t = useT();
  const { addServer, discover, discovered, discovering } = useConnection();
  const { physicalKeyboard } = useEnv();
  const [value, setValue] = useState('');
  // `connect` is only ever reached from the Add-profile wizard, so Back returns
  // there (never a dead-end at the launch screen).
  useFocusNav({ onBack: nav.back, resetKey: discovered.length });

  // When LAN discovery finds something, prefill the field (host only) so OK adds it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: prefill once when discovery yields a hit; intentionally not re-run on `value` edits.
  useEffect(() => {
    const found = discovered.at(-1);
    if (found && !value) {
      try {
        setValue(new URL(found).host);
      } catch {
        setValue(found);
      }
    }
  }, [discovered]);

  /**
   * What the typed address turned out to be, once something answered it.
   *
   * The scheme is optional to TYPE - nobody spells out `https://` on a remote -
   * but it must never be invisible: a server reached in the clear and one
   * reached over TLS look identical in this box, and only one of them is safe to
   * put a password into. So the address is probed and the answer is shown.
   */
  const [resolved, setResolved] = useState<ResolvedOrigin | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    const address = value.trim();
    setResolved(null);
    if (!address) {
      setProbing(false);
      return;
    }
    let cancelled = false;
    // Debounced, because the address arrives one remote press at a time and
    // probing "l", "lu", "lum"... is a pair of requests per keystroke.
    const timer = setTimeout(() => {
      setProbing(true);
      resolveServerOrigin(address)
        .then((hit) => {
          if (cancelled) return;
          setResolved(hit);
          setProbing(false);
        })
        .catch(() => {
          if (!cancelled) setProbing(false);
        });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  const submit = () => {
    const address = value.trim();
    if (!address) return;
    // Whatever actually answered wins. The fallback keeps the old behaviour for
    // a server that is simply not up yet: it can still be saved, it just cannot
    // be promised to be secure.
    const url = resolved?.url ?? (/^https?:\/\//i.test(address) ? address : `http://${address}`);
    addServer(url);
    nav.go('quick');
  };

  return (
    <AuthScreen>
      <Box mb={24}>
        <KromaMark size={32} />
      </Box>
      <Box w="100%" maxW={720}>
        <Txt variant="h1" style={{ fontSize: 38, fontWeight: '600', textAlign: 'center' }}>
          {t('connect.addServerTitle')}
        </Txt>
        <Txt
          style={{
            fontSize: 16,
            fontWeight: '500',
            textAlign: 'center',
            marginTop: 6,
            marginBottom: 24,
          }}
          color="textDim"
        >
          {t('connect.addServerSub')}
        </Txt>

        <Field
          value={value}
          onChange={setValue}
          onSubmit={submit}
          icon="world-search"
          placeholder={t('connect.serverPlaceholder')}
          // The screen's own title already says "Add a server"; a label row here
          // would repeat it. Still the accessible name for the input.
          label={t('connect.addServerTitle')}
          hideLabel
          keyboardType="url"
          physicalKeyboard={physicalKeyboard}
          mb={20}
          entry={{
            py: 16,
            radius: 'md',
            bg: '#0F0F13',
            textStyle: { fontSize: 20, fontWeight: '600' },
          }}
          trailing={
            <Button
              variant="glass"
              size="sm"
              focusScale={1.05}
              label={discovering ? t('common.detecting') : t('connect.detect')}
              onPress={discover}
              style={DETECT}
            />
          }
        />

        {value.trim() ? <SchemeBadge probing={probing} resolved={resolved} /> : null}

        <OnScreenKeyboard
          value={value}
          onChange={setValue}
          onSubmit={submit}
          layout="url"
          submitLabel={t('connect.connect')}
        />

        <Hint
          text={t('connect.keyboardHint')}
          size={14}
          gap={4}
          justify="center"
          mt={20}
          color="rgba(244, 243, 240, 0.4)"
          textStyle={{ fontWeight: '500' }}
        />
      </Box>
    </AuthScreen>
  );
}

const DETECT = { flexShrink: 0, backgroundColor: 'transparent', paddingHorizontal: 16 } as const;
const SCHEME_TEXT = { fontSize: 14, fontWeight: '600' } as const;

/**
 * Says which scheme the address really uses, once it is known.
 *
 * Three states, and the third is the point: while nothing has answered it says
 * so rather than showing a padlock it has not earned. `accent` for plain HTTP
 * rather than `danger` - an unencrypted server on a home LAN is the normal case
 * here, worth naming but not an error.
 */
function SchemeBadge({
  probing,
  resolved,
}: Readonly<{ probing: boolean; resolved: ResolvedOrigin | null }>) {
  const t = useT();
  let icon: IconName = 'help-circle';
  let color = 'textDim';
  let text = t('connect.schemeUnknown');
  if (probing) {
    icon = 'radar';
    text = t('connect.schemeChecking');
  } else if (resolved) {
    icon = resolved.secure ? 'lock' : 'lock-open';
    color = resolved.secure ? 'success' : 'accent';
    text = t(resolved.secure ? 'connect.schemeSecure' : 'connect.schemeInsecure');
  }
  return (
    <Box row align="center" justify="center" gap={6} mb={16}>
      <Icon name={icon} size={16} color={color} />
      <Txt style={SCHEME_TEXT} color={color}>
        {text}
      </Txt>
    </Box>
  );
}
