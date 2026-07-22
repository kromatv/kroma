// Quick Connect: scan the QR the TV shows (the code rides its query params) or
// type the 4-digit code, then authorize that device into this account (mirror
// of the web flow, POST /auth/quickconnect/authorize).

import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BackLink,
  OnboardingBox,
  OnboardingScreen,
  OnboardingTitle,
} from '#mobile/components/OnboardingScreen';
import { CodeCells } from '#mobile/components/onboarding';
import { ErrorBanner } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { absoluteFill, colors, radius, spacing, type } from '#mobile/lib/theme';
import { CheckIcon, ScanIcon, TvIcon } from '#mobile/player/icons';

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
    <OnboardingScreen keyboardBehavior="height">
      <OnboardingBox>
        {state === 'done' ? (
          <View style={styles.center}>
            <View style={styles.doneBadge}>
              <CheckIcon size={34} color={colors.accentInk} />
            </View>
            <OnboardingTitle
              title={t('connect.connected')}
              subtitle={t('connect.willConnectSoon')}
            />
          </View>
        ) : (
          <>
            <OnboardingTitle title={t('connect.title')} subtitle={t('connect.codePrompt')} />
            <View style={styles.center}>
              {camera ? (
                <View style={styles.cameraBox}>
                  {cameraOn ? (
                    <>
                      <camera.CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={({ data }) => onScanned(data)}
                      />
                      <View style={styles.cameraFrame} pointerEvents="none" />
                    </>
                  ) : (
                    <Pressable
                      onPress={() => void enableCamera()}
                      style={({ pressed }) => [
                        styles.cameraOff,
                        pressed && { backgroundColor: colors.surfaceHigh },
                      ]}
                    >
                      <ScanIcon size={34} color={colors.accent} />
                      <Text style={styles.cameraOffLabel}>{t('connect.scanTvQr')}</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <TvIcon size={56} color={colors.accent} />
              )}
              <CodeCells
                value={code}
                onChange={onChange}
                error={state === 'error'}
                showActive={state !== 'busy'}
                refocusOnBlur={state === 'idle' || state === 'error'}
              />
            </View>
            <ErrorBanner message={state === 'error' ? t('connect.invalidCode') : null} />
          </>
        )}
        <BackLink onPress={() => router.back()} />
      </OnboardingBox>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.md },
  cameraBox: {
    width: 176,
    height: 176,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  cameraOff: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
  },
  cameraOffLabel: {
    ...type.caption,
    color: colors.accent,
    fontWeight: '700',
    textAlign: 'center',
  },
  cameraFrame: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.md,
  },
  doneBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
