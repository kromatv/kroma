import { type ResolvedOrigin, resolveServerOrigin } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Field, Hint, Icon, type IconName, styles, Txt, useFocusNav } from '@kroma/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useEnv } from '#tv/app/providers/env';
import { useNav } from '#tv/app/router';
import { AuthScreen, KromaMark, OnScreenKeyboard } from '#tv/shared/ui';

/**
 * Add a server by address via an on-screen URL keyboard; on submit the server is
 * upserted and the flow advances to Quick Connect.
 */
export function TvConnect() {
  const nav = useNav();
  const t = useT();
  const { addServer, discovered } = useConnection();
  const { physicalKeyboard } = useEnv();
  const [value, setValue] = useState('');
  useFocusNav({ onBack: nav.back, resetKey: discovered.length });

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

  // Only one of http and https is safe to put a password into, so the
  // address is probed and the scheme shown rather than left implicit. The
  // result is tagged with the address it answers for, so a submit can tell a
  // finished probe from a stale one.
  const [probe, setProbe] = useState<{ address: string; origin: ResolvedOrigin | null } | null>(
    null,
  );
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    const address = value.trim();
    setProbe(null);
    if (!address) {
      setProbing(false);
      return;
    }
    let cancelled = false;
    // Debounced: each keystroke would otherwise cost a pair of requests.
    const timer = setTimeout(() => {
      setProbing(true);
      resolveServerOrigin(address)
        .then((hit) => {
          if (cancelled) return;
          setProbe({ address, origin: hit });
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

  const submitting = useRef(false);
  const submit = async () => {
    const address = value.trim();
    if (!address || submitting.current) return;
    submitting.current = true;
    try {
      // Enter must not lose to the debounce: when the badge has not answered
      // for THIS address yet, probe now and wait for it rather than guess.
      let hit = probe;
      if (hit?.address !== address) {
        setProbing(true);
        const origin = await resolveServerOrigin(address).catch(() => null);
        hit = { address, origin };
        setProbe(hit);
        setProbing(false);
      }
      // Only a validated origin proceeds: the old http:// fallback saved
      // addresses that then failed on the very next screen. The badge below
      // says why Enter stayed put.
      if (!hit.origin) return;
      addServer(hit.origin.url);
      nav.go('quick');
    } finally {
      submitting.current = false;
    }
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
        />

        {value.trim() ? <SchemeBadge probing={probing} probe={probe} /> : null}

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

const s = styles({
  schemeText: { fontSize: 14, fontWeight: '600' },
});

// Plain HTTP is `accent`, not `danger`: an unencrypted server on a home LAN
// is the normal case here. A probe that ANSWERED nothing is `danger`, because
// it is also what keeps Enter from proceeding.
function SchemeBadge({
  probing,
  probe,
}: Readonly<{
  probing: boolean;
  probe: { address: string; origin: ResolvedOrigin | null } | null;
}>) {
  const t = useT();
  let icon: IconName = 'help-circle';
  let color = 'textDim';
  let text = t('connect.schemeUnknown');
  if (probing) {
    icon = 'radar';
    text = t('connect.schemeChecking');
  } else if (probe?.origin) {
    icon = probe.origin.secure ? 'lock' : 'lock-open';
    color = probe.origin.secure ? 'success' : 'accent';
    text = t(probe.origin.secure ? 'connect.schemeSecure' : 'connect.schemeInsecure');
  } else if (probe) {
    icon = 'alert-circle';
    color = 'danger';
    text = t('connect.unreachable');
  }
  return (
    <Box row align="center" justify="center" gap={6} mb={16}>
      <Icon name={icon} size={16} color={color} />
      <Txt style={s.schemeText} color={color}>
        {text}
      </Txt>
    </Box>
  );
}
