#!/usr/bin/env bun
// Drives the real TV shell in a real browser and asserts what jsdom cannot see:
// that exactly ONE control wears the focus ring, that nothing shouted on the
// console, that the mounted control count stays bounded, and that the app's own
// frame counter reports frames. Exits non-zero on a failure, so a PR can be
// gated on it.
//
//   bun run tv:probe                          serve the shell, run, report
//   bun run tv:probe --url http://…:5179      against a shell already serving
//   bun run tv:probe --keys 48 --locale fr    a longer walk, read in French
//   bun run tv:probe --throttle 1 --shot p.png  full speed, keep the last frame

import { chromium } from 'playwright';
import { checks } from './check';
import { boot, openDestination, remote } from './drive';
import { flags } from './flags';
import { locales, message } from './locale';
import { frames, read, startFrames } from './read';
import { report } from './report';
import { serveTvShell } from './serve';
import { catalogue, deviceEntries, SESSION_ENTRIES, stubApi } from './stub';
import { walk } from './walk';

const DESTINATION = 'nav.films';
const STAGE = { width: 1920, height: 1080 };
// A viewport that leaves a row half in view: the overscan row a grid mounts
// below the fold is where a ring on every tile shows up.
const TALL = { width: 2260, height: 1778 };

const { url, locale, presses, items, growth, minFps, shot, tall, throttle } = flags(
  process.argv.slice(2),
);

if (!locales().includes(locale)) {
  throw new Error(`unknown locale "${locale}"; the app speaks ${locales().join(', ')}`);
}
const destination = message(locale, DESTINATION);

const serving = url ? null : await serveTvShell();
const origin = serving ? serving.url : url;
const browser = await chromium.launch();
const complaints: string[] = [];

try {
  const page = await browser.newPage({ viewport: tall ? TALL : STAGE, deviceScaleFactor: 1 });
  page.on('console', (entry) => {
    if (entry.type() === 'error') complaints.push(entry.text());
  });
  page.on('pageerror', (error) => complaints.push(`pageerror: ${error.message}`));

  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }

  await stubApi(page, catalogue(items));
  await page.addInitScript(
    ([device, session]) => {
      for (const [key, value] of Object.entries(device)) localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
    },
    [deviceEntries(origin, locale), SESSION_ENTRIES] as const,
  );

  await boot(page, origin);
  await openDestination(page, destination);

  const atRest = await read(page);
  await startFrames(page);
  const walked = await walk(remote(page), presses);
  const measured = await frames(page);
  if (shot) await page.screenshot({ path: shot });

  const verdicts = checks({
    atRest,
    walked,
    frames: measured,
    console: complaints,
    growth,
    minFps,
  });

  const printed = report({ origin, destination, presses, items, throttle, verdicts, complaints });
  for (const line of printed) console.log(line);

  if (verdicts.some(({ ok }) => !ok)) process.exitCode = 1;
} finally {
  await browser.close();
  serving?.stop();
}
