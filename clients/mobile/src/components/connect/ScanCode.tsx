// The "scan or code" half of Connect a device: point the camera at the QR the
// television shows, or key in the four digits under it. Both roads end in
// `POST /auth/quickconnect/authorize`, so both live here.
//
// Owns the code buffer and the request, because nothing outside cares about
// either: the screen wants one thing from this component, which is to be told
// when a device has been connected.
//
// TWO DELIBERATE CHOICES, both measured rather than assumed:
//
// - The pad is the kit's, not the system keyboard, and `physicalKeyboard` is
//   therefore off - the cells are presentational. iOS puts an AutoFill chip
//   over a `number-pad` that NO field prop removes (`textContentType="none"`,
//   `autoComplete="off"`, `autoCorrect`, `spellCheck`, `importantForAutofill`
//   were all tried): it belongs to the keyboard, not the field. A pad we draw
//   has no chip, and its height is ours.
// - No scroll view. Everything here is a fixed height except the viewfinder,
//   which takes what is left, so the pad's last row is on screen on the
//   shortest phone with nothing to drag. `aspectRatio` is NOT used to keep the
//   viewfinder square: it computes height from width and beats the flex, which
//   is what pushed the pad off the bottom.

import { Box, Icon, Keypad, OtpField, styles, Text } from '@kroma/ui/kit';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { ErrorBanner } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

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

const CODE_LENGTH = 4;
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

export function ScanCode({ onConnected }: Readonly<{ onConnected: () => void }>) {
  const t = useT();
  const client = useClient();
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [cameraOn, setCameraOn] = useState(false);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    void (async () => {
      const current = await camera.Camera.getCameraPermissionsAsync();
      if (!cancelled && current.granted) setCameraOn(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (value: string) => {
    setState('busy');
    try {
      await client.quickConnectAuthorize(value);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConnected();
    } catch {
      setState('error');
      setCode('');
      scannedRef.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // The one way the buffer changes, whatever moved it: a key, the delete, or a
  // QR that arrived whole.
  const enter = (next: string) => {
    const digits = next.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (state === 'error') setState('idle');
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

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
    enter(scanned);
  };

  return (
    <Box style={s.scan}>
      <Box style={s.cameraBox}>
        {camera && cameraOn ? (
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
            disabled={!camera}
            style={({ pressed }) => [s.cameraOff, pressed && s.cameraOffPressed]}
          >
            <Icon name="scan" size={34} thickness={1.8} color="accentText" />
            <Text style={s.cameraOffLabel}>{t('connect.scanTvQr')}</Text>
          </Pressable>
        )}
      </Box>

      <OtpField.Root
        maxLength={CODE_LENGTH}
        value={code}
        onValueChange={enter}
        invalid={state === 'error'}
        disabled={state === 'busy'}
      />
      <ErrorBanner message={state === 'error' ? t('connect.invalidCode') : null} />
      <Keypad
        size="compact"
        autoFocus={false}
        disabled={state === 'busy'}
        onDigit={(digit) => enter(code + digit)}
        onDelete={() => enter(code.slice(0, -1))}
      />
    </Box>
  );
}

const s = styles({
  scan: { flex: true, align: 'center', gap: spacing.md, pt: spacing.sm, pb: spacing.sm },
  // The one thing here that gives, and the reason nothing scrolls.
  cameraBox: {
    flex: true,
    w: 190,
    maxH: 190,
    minH: 72,
    self: 'center',
    bg: 'surface2',
    radius: radius.lg,
    overflow: 'hidden',
  },
  cameraOff: { fill: true, center: true, gap: 10, px: spacing.md },
  cameraOffPressed: { bg: 'surface3' },
  cameraOffLabel: { ...type.caption, color: 'accentText', fontWeight: '700', textAlign: 'center' },
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
});
