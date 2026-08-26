import 'virtual:kroma-tv.css';
import { mountTv } from '@kroma/tv/mount';
// Display-matched grade of the brand-intro film, bundled by THIS shell only: the
// Tauri window is transparent (native mpv plane behind the webview), which costs
// <video> its compositor fast path, so the shared 4K60 HEVC film decodes and
// downscales the slow way and stutters. 1080p60 is a quarter of the work and
// indistinguishable in a desktop window, and H.264 (not HEVC like the shared
// film) so Linux WebKitGTK can decode it at all (gstreamer1.0-libav; HEVC there
// hit the CSS fallback) and a software decode stays cheap. Same master,
// `scale=1920:1080` x264 crf18 re-encode (avc1 + faststart), see packages/ui
// KromaIntro/constants.ts.
import introFilm from './assets/kroma-intro-h264-1080.mp4';
import { startGamepadBridge } from './gamepad';
import { installStage } from './stage';
import { startUpdater } from './updater';

// The 1920x1080 stage, on EVERY desktop window: the shared 10-foot UI is authored
// in fixed pixels against that canvas (PosterGrid's 8 x 203px columns, the nav row,
// the episode column), so a free-size window narrower than 1920 does not shrink the
// layout, it clips it. Fitted the same way as the Steam Deck panel and the browser
// shell (see ./stage and clients/tv-web/src/stage.ts). A genuinely fluid 10-foot
// layout is a design-system change, not a shell one.
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const fixedScreen = /Linux/i.test(ua) && !/Android/i.test(ua);
installStage();

// The Deck is driven by a gamepad, not a remote. Bridge the Gamepad API onto the
// same synthetic key events the shared TV nav already listens for.
startGamepadBridge();

mountTv({ platform: 'Desktop', introVideoSrc: introFilm });

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
