import type { Delivery } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Box, InputGroup, Text } from '@kromatv/ui/kit';
import { useState } from 'react';

// `navigator.clipboard` is undefined outside a secure context, so on a
// plain-http LAN address this throws synchronously, not via rejection.
async function copyText(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

const LINK_KIND = {
  reset: {
    path: '/reset',
    outcome: {
      manual: 'admin.resetManual',
      smtp: 'admin.resetSent',
      relay: 'admin.resetSent',
      inactive: 'admin.resetInactive',
      refused: 'admin.resetRefused',
    },
  },
  verify: {
    path: '/verify-email',
    outcome: {
      manual: 'admin.verificationManual',
      smtp: 'admin.verificationSent',
      relay: 'admin.verificationSent',
      inactive: 'admin.verificationInactive',
      refused: 'admin.verificationRefused',
    },
  },
} as const satisfies Record<string, { path: string; outcome: Record<Delivery, string> }>;

/** A minted link (reset or verification) with its copy button and the delivery
 * outcome: sent by email, or left to the owner. A reset's HAND-CARRIED link embeds the code (the owner holds both
 * halves anyway, and their channel is the trusted one) so the user only picks
 * a new password; an emailed link never carries it. When the server knows no
 * public URL at all, the link is composed from the browser's own origin, which
 * is right for an owner browsing the very server they admin. */
export function LinkResult({
  kind,
  label,
  url,
  token,
  delivered,
  code,
}: Readonly<{
  kind: 'reset' | 'verify';
  label: string;
  url: string | null;
  token: string;
  delivered: Delivery;
  code?: string;
}>) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const { path, outcome } = LINK_KIND[kind];
  const base =
    url ??
    (typeof window !== 'undefined' ? `${window.location.origin}${path}?token=${token}` : null);
  const byHand = delivered !== 'smtp' && delivered !== 'relay';
  const shown = kind === 'reset' && byHand && base && code ? `${base}&code=${code}` : base;
  return (
    <Box gap={8}>
      {shown ? (
        <InputGroup.Root label={label}>
          <InputGroup.Input value={shown} autoFocus={false} />
          <InputGroup.Addon align="inline-end">
            <InputGroup.Button
              icon="copy"
              label={copied ? t('common.copied') : t('common.copy')}
              onPress={() => {
                void copyText(shown).then((ok) => {
                  if (!ok) return;
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            />
          </InputGroup.Addon>
        </InputGroup.Root>
      ) : null}
      <Text variant="meta" color="textMuted">
        {t(outcome[delivered])}
      </Text>
    </Box>
  );
}
