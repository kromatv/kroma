import { $ } from 'bun';
import { warning } from './actions';

const TAURI_DEPS = [
  'libwebkit2gtk-4.1-dev',
  'libgtk-3-dev',
  'librsvg2-dev',
  'libayatana-appindicator3-dev',
  'patchelf',
  'file',
];

async function present(binary: string): Promise<boolean> {
  return (await $`command -v ${binary}`.quiet().nothrow()).exitCode === 0;
}

async function apt(packages: readonly string[], attempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const update = await $`timeout 120 sudo apt-get update`.nothrow();
    const install =
      update.exitCode === 0
        ? await $`timeout 180 sudo apt-get install -y --no-install-recommends ${packages}`.nothrow()
        : update;
    if (install.exitCode === 0) return;
    warning(`apt attempt ${attempt} for ${packages.join(' ')} stalled or failed`);
    await Bun.sleep(10_000);
  }
  throw new Error(`could not install ${packages.join(' ')} after ${attempts} attempts`);
}

async function ffmpeg(): Promise<void> {
  if (await present('ffmpeg')) {
    const [banner] = (await $`ffmpeg -version`.text()).split('\n');
    console.log(`already on the image: ${banner}`);
    return;
  }
  await apt(['ffmpeg']);
}

const tauriDeps = () => apt(TAURI_DEPS);

export async function main(argv: string[]): Promise<void> {
  const [tool] = argv;
  if (tool === 'ffmpeg') return ffmpeg();
  if (tool === 'tauri-deps') return tauriDeps();
  throw new Error('usage: bun run ci tools <ffmpeg|tauri-deps>');
}
