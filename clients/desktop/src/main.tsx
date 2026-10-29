import '@kromatv/ui/css/tv';
import { mountTv } from '@kromatv/tv/mount';
import { installStage } from '@kromatv/tv/stage';
// Display-matched grade of the brand-intro film, bundled by THIS shell only:
// 1080p60 is a quarter of the shared 4K60 film's decode work and
// indistinguishable in a desktop window, and H.264 (not HEVC like the shared
// film) so Linux WebKitGTK can decode it at all (gstreamer1.0-libav; HEVC there
// hit the CSS fallback) and a software decode stays cheap. Same master,
// `scale=1920:1080` x264 crf18 re-encode (avc1 + faststart), see packages/ui
// KromaIntro/constants.ts.
import introFilm from './assets/kroma-intro-h264-1080.mp4';
import { desktopDeviceName } from './deviceName';
import { startGamepadBridge } from './gamepad';
import { startUpdater } from './updater';
import { installVideoHole, nativePlane } from './video-hole';

// The 10-foot UI is authored against a 1920x1080 canvas; the stage scales it to
// the window and hands it the rest of the window as canvas, so a window of any
// shape is filled edge to edge (`installStage`, @kromatv/tv/stage).
const fixedScreen = nativePlane();
installStage();

// The Deck is driven by a gamepad, not a remote. Bridge the Gamepad API onto the
// same synthetic key events the shared TV nav already listens for.
startGamepadBridge();

mountTv({ platform: 'Desktop', introVideoSrc: introFilm, deviceName: desktopDeviceName() });

// Linux draws the picture on an mpv plane cut into the page, and WebKitGTK never
// lets a pixel through on its own; the plane's shape is what makes it visible
// (see ./video-hole).
installVideoHole();

// The frontend is alive: disarm the GPU-rendering crash guard for this boot
// (src-tauri/src/webview_gpu.rs). The command exists on the Linux shell only.
if (fixedScreen) {
  (
    globalThis as { __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } } }
  ).__TAURI__?.core
    ?.invoke?.('webview_boot_ok')
    .catch(() => undefined);
}

// Keep the app current from GitHub Releases (no-op in a browser dev run).
startUpdater();
