import { type ResolvedOrigin, resolveServerOrigin } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, Field, Icon, type IconName, Text, useFocusNav } from '@kromatv/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useEnv } from '#tv/app/providers/env';
import { useNav } from '#tv/app/router';
import { AuthScreen, GATE_MARK, KromaMark, UrlKeyboard } from '#tv/shared/ui';

/**
 * Add a server by address via an on-screen URL keyboard; on submit the server is
 * upserted and the flow advances to Quick Connect.
 */
function hostOf(found: string): string {
  try {
    return new URL(found).host;
  } catch {
    return found;
  }
}

export function TvConnect() {
  const nav = useNav();
  const t = useT();
  const { addServer, discovered } = useConnection();
  const { physicalKeyboard } = useEnv();
  const [value, setValue] = useState('');
  useFocusNav({ onBack: nav.back, resetKey: discovered.length });

  const [seenDiscovered, setSeenDiscovered] = useState(discovered);
  if (seenDiscovered !== discovered) {
    setSeenDiscovered(discovered);
    const found = discovered.at(-1);
    if (found && !value) setValue(hostOf(found));
  }

  // Only one of http and https is safe to put a password into, so the
  // address is probed and the scheme shown rather than left implicit. The
  // result is tagged with the address it answers for, so a submit can tell a
  // finished probe from a stale one.
  const [probe, setProbe] = useState<{ address: string; origin: ResolvedOrigin | null } | null>(
    null,
  );
  const [probing, setProbing] = useState(false);

  const [probedValue, setProbedValue] = useState(value);
  if (probedValue !== value) {
    setProbedValue(value);
    setProbe(null);
    if (!value.trim()) setProbing(false);
  }

  useEffect(() => {
    const address = value.trim();
    if (!address) return;
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
        <KromaMark size={GATE_MARK} />
      </Box>
      <Box w="100%" maxW={720}>
        <Text variant="titleTv" textAlign="center">
          {t('connect.addServerTitle')}
        </Text>
        <Text variant="leadTv" textAlign="center" mt={6} mb={24} color="textDim">
          {t('connect.addServerSub')}
        </Text>

        <Field.Root
          label={t('connect.addServerTitle')}
          hideLabel
          value={value}
          onValueChange={setValue}
          mb={20}
        >
          <Field.Input
            icon="world-search"
            placeholder={t('connect.serverPlaceholder')}
            keyboardType="url"
            physicalKeyboard={physicalKeyboard}
            onSubmit={submit}
          />
        </Field.Root>

        {value.trim() ? <SchemeBadge probing={probing} probe={probe} /> : null}

        <UrlKeyboard
          value={value}
          onValueChange={setValue}
          onSubmit={submit}
          submitLabel={t('connect.connect')}
        />
      </Box>
    </AuthScreen>
  );
}

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
      <Text variant="labelTv" color={color}>
        {text}
      </Text>
    </Box>
  );
}
