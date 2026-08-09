// Quick Connect: scan the QR the TV shows (the code rides its query params) or
// type the 4-digit code, then authorize that device into this account (mirror
// of the web flow, POST /auth/quickconnect/authorize).

import { Box, Icon, OtpField, styles, Txt } from '@kroma/ui/kit';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import {
  OnboardingBox,
  OnboardingScreen,
  OnboardingTitle,
} from '#mobile/components/OnboardingScreen';
import { ErrorBanner } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

// expo-camera is a NATIVE module and expo-router imports every route at boot:
// a static import would crash the whole app on a binary built before the
// module was added. Load it lazily so scanning is simply unavailable there.
function loadCamera(): typeof import('expo-camera') | null {
  try {
    return require('expo-camera');
  } catch {
    return null;
  }
}
const camera = loadCamera();

const QUERY_CODE = /[?&]code=(\d{4,8})/;
const BARE_CODE = /^\d{4,8}$/;

/** Pull a Quick Connect code out of a scanned QR payload: the authorize URL's
 * `code` query param, or a bare numeric code. */
export function codeFromQr(payload: string): string | null {
  const fromQuery = QUERY_CODE.exec(payload);
  if (fromQuery?.[1]) return fromQuery[1];
  const bare = BARE_CODE.exec(payload.trim());
  return bare ? bare[0] : null;
}

export default function ConnectDevice() {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [cameraOn, setCameraOn] = useState(false);
  const scannedRef = useRef(false);

  const submit = async (value: string) => {
    setState('busy');
    try {
      await client.quickConnectAuthorize(value);
      setState('done');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setState('error');
      setCode('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const onChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setCode(digits);
    if (state === 'error') setState('idle');
    if (digits.length === 4) void submit(digits);
  };

  // One page, everything visible: the camera activates in place above the
  // manual code cells (no mode toggle).
  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    void (async () => {
      const current = await camera.Camera.getCameraPermissionsAsync();
      if (cancelled) return;
      if (current.granted) setCameraOn(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enableCamera = async () => {
    if (!camera) return;
    const result = await camera.Camera.requestCameraPermissionsAsync();
    if (result.granted) setCameraOn(true);
  };

  const onScanned = (payload: string) => {
    if (scannedRef.current || state === 'busy') return;
    const scanned = codeFromQr(payload);
    if (!scanned) return;
    scannedRef.current = true;
    setCode(scanned);
    void submit(scanned);
  };

  return (
    <OnboardingScreen keyboardBehavior="height" onBack={() => goBack(router)}>
      <OnboardingBox>
        {state === 'done' ? (
          <Box style={s.center}>
            <Box style={s.doneBadge}>
              <Icon name="check" size={34} stroke={2.4} color={colors.accentInk} />
            </Box>
            <OnboardingTitle
              title={t('connect.connected')}
              subtitle={t('connect.willConnectSoon')}
            />
          </Box>
        ) : (
          <>
            <OnboardingTitle title={t('connect.title')} subtitle={t('connect.codePrompt')} />
            <Box style={s.center}>
              {camera ? (
                <Box style={s.cameraBox}>
                  {cameraOn ? (
                    <>
                      <camera.CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={({ data }) => onScanned(data)}
                      />
                      <Box style={s.cameraFrame} pointerEvents="none" />
                    </>
                  ) : (
                    <Pressable
                      onPress={() => void enableCamera()}
                      style={({ pressed }) => [
                        s.cameraOff,
                        pressed && { backgroundColor: colors.surfaceHigh },
                      ]}
                    >
                      <Icon name="scan" size={34} stroke={1.8} color={colors.accent} />
                      <Txt style={s.cameraOffLabel}>{t('connect.scanTvQr')}</Txt>
                    </Pressable>
                  )}
                </Box>
              ) : (
                <Icon name="device-tv" size={56} stroke={1.8} color={colors.accent} />
              )}
              <OtpField
                maxLength={4}
                value={code}
                onChange={onChange}
                invalid={state === 'error'}
                disabled={state === 'busy'}
                physicalKeyboard
                autoFocus
              />
            </Box>
            <ErrorBanner message={state === 'error' ? t('connect.invalidCode') : null} />
          </>
        )}
      </OnboardingBox>
    </OnboardingScreen>
  );
}

const s = styles({
  center: { align: 'center', gap: spacing.md },
  cameraBox: { w: 176, h: 176, bg: 'surface2', radius: radius.lg, overflow: 'hidden' },
  cameraOff: { fill: true, center: true, gap: 10, px: spacing.md },
  cameraOffLabel: { ...type.caption, color: 'accent', fontWeight: '700', textAlign: 'center' },
  cameraFrame: {
    absolute: true,
    top: 16,
    right: 16,
    bottom: 16,
    left: 16,
    radius: radius.md,
    border: 'accent',
    borderWidth: 2,
  },
  doneBadge: { center: true, w: 72, h: 72, bg: 'accent', radius: 36 },
});
