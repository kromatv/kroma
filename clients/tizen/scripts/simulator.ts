// Drives Samsung's TV web simulator over CDP, so a built package can be
// exercised in the Tizen `webapis`/`tizen` environment rather than a bare
// browser. What the simulator is NOT is an engine: it runs one bundled NW.js
// (Chromium 137 at the time of writing) whatever `--tizentvversion` says, and
// advertises a user-agent claiming Chrome 55. So it proves the package loads,
// paints and answers the remote; it can never prove an engine floor, and
// `check:legacy` remains the only thing that does.
//
// The simulator ignores `--file` unless its profile has never been started, so
// the app is loaded by pointing its viewport iframe at the built index.html,
// which is the same thing its installer would have done.

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  hideCascadeLayers,
  hideCustomProperties,
  type Painted,
  readButtonSpot,
  readFocusRing,
  readPainted,
  setViewportSrc,
} from './simulator-page.ts';

export type { Painted };

// Tizen Studio installs the simulator under the same tools directory on every
// host; only the shape of the NW.js binary differs, and macOS wraps it in an
// app bundle. `TIZEN_HOME` is the variable the Makefile and SETUP.md already
// use for a non-default install.
const NWJS_BY_PLATFORM: Record<string, string> = {
  darwin: 'nwjs.app/Contents/MacOS/nwjs',
  linux: 'nwjs',
  win32: 'nwjs.exe',
};

function simulatorBinary(): string {
  const relative = NWJS_BY_PLATFORM[platform()];
  if (!relative) throw new Error(`no Tizen TV simulator known for ${platform()}`);
  const home = process.env.TIZEN_HOME ?? join(homedir(), 'tizen-studio');
  const binary = join(home, 'tools', 'sec-tv-simulator', relative);
  if (!existsSync(binary)) {
    throw new Error(
      `no TV simulator at ${binary}. Install "TV Extensions" in the Tizen Studio package manager, or set TIZEN_HOME.`,
    );
  }
  return binary;
}

/** Which bundle the engine gate should be pushed into. */
export type Tier = 'modern' | 'legacy' | 'deep';

// The buttons on the simulator's own remote graphic. Pressing those rather than
// synthesising a key event is the whole point: the simulator posts what a
// television posts, a keyCode and no `key`, and an app that reads only
// `KeyboardEvent.key` is undrivable on any engine below Chrome 51.
const REMOTE_BUTTONS = {
  up: 'sc_2016_icon_bt_11_',
  down: 'sc_2016_icon_bt_12_',
  left: 'sc_2016_icon_bt_9_',
  right: 'sc_2016_icon_bt_10_',
  ok: 'sc_2016_icon_bt_8_',
} as const satisfies Record<string, string>;

export type RemoteKey = keyof typeof REMOTE_BUTTONS;

// Which probes the engine gate should fail, per tier. Installed in the page
// before the app's own scripts run.
const DISGUISE: Record<Tier, (() => void) | null> = {
  modern: null,
  legacy: hideCascadeLayers,
  deep: hideCustomProperties,
};

const Target = z.object({ type: z.string(), url: z.string(), webSocketDebuggerUrl: z.string() });
const Reply = z.object({
  id: z.number().optional(),
  method: z.string().optional(),
  result: z.unknown().optional(),
  params: z.unknown().optional(),
});
// `value` is absent whenever the expression returns nothing, which the calls
// that only set a property do.
const Evaluated = z.object({ result: z.object({ value: z.unknown().optional() }).optional() });
const Screenshot = z.object({ data: z.string() });
const Thrown = z.object({
  exceptionDetails: z.object({
    text: z.string().optional(),
    exception: z.object({ description: z.string().optional() }).optional(),
  }),
});
const Added = z.object({ identifier: z.string() });
const Point = z.object({ x: z.number(), y: z.number() });

// Mirrors the `Painted` interface the page half returns; the two are checked
// against each other by `satisfies` below.
const PaintedShape = z.object({
  scripts: z.array(z.string()),
  rootChars: z.number(),
  bodyBackground: z.string(),
  tizen: z.string(),
  webapis: z.string(),
  cascadeLayers: z.string(),
  customProperties: z.boolean(),
  webfontApplied: z.boolean(),
}) satisfies z.ZodType<Painted>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A running simulator. Always `close()` it: the process outlives the script. */
export class Simulator {
  private nextId = 0;
  private readonly pending = new Map<number, (value: unknown) => void>();
  private readonly thrown: string[] = [];
  private disguise: string | undefined;

  private constructor(
    private readonly proc: ChildProcess,
    private readonly ws: WebSocket,
  ) {
    ws.onmessage = (event) => {
      const reply = Reply.safeParse(JSON.parse(String(event.data)));
      if (!reply.success) return;
      const { id, method, result, params } = reply.data;
      if (id !== undefined && this.pending.has(id)) {
        this.pending.get(id)?.(result);
        this.pending.delete(id);
        return;
      }
      if (method !== 'Runtime.exceptionThrown') return;
      const detail = Thrown.safeParse(params);
      if (!detail.success) return;
      const { text, exception } = detail.data.exceptionDetails;
      this.thrown.push(exception?.description ?? text ?? 'unknown exception');
    };
  }

  static async launch({
    tizenVersion = '3.0',
    port = 9360,
    resolution = '1920x1080',
  }: {
    tizenVersion?: string;
    port?: number;
    resolution?: string;
  } = {}): Promise<Simulator> {
    const proc = spawn(
      simulatorBinary(),
      // biome-ignore format: one flag per line reads worse than one pair per line
      [
        '--platform', 'tv',
        '--tizentvversion', tizenVersion,
        '--resolution', resolution,
        `--remote-debugging-port=${port}`,
      ],
      { stdio: 'ignore' },
    );

    const deadline = Date.now() + 40_000;
    let page: z.infer<typeof Target> | undefined;
    while (!page && Date.now() < deadline) {
      await wait(700);
      page = await fetch(`http://127.0.0.1:${port}/json`)
        .then(async (res) => z.array(Target).parse(await res.json()))
        .then((all) => all.find((t) => t.type === 'page' && t.url.includes('ripple.html')))
        .catch(() => undefined);
    }
    if (!page) {
      proc.kill();
      throw new Error(`simulator did not expose a CDP page on ${port}`);
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('simulator CDP socket refused'));
    });
    const sim = new Simulator(proc, ws);
    await sim.send('Page.enable');
    await sim.send('Runtime.enable');
    return sim;
  }

  private send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // A function rather than a source string: it is serialised here and run in
  // the page, so it typechecks against the DOM on this side and cannot drift
  // into an escaping bug. `returnByValue` serialises the result already.
  private async call<T, A extends readonly unknown[]>(
    shape: z.ZodType<T>,
    fn: (...args: A) => unknown,
    ...args: A
  ): Promise<T> {
    const call = `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`;
    const raw = await this.send('Runtime.evaluate', {
      expression: call,
      returnByValue: true,
      awaitPromise: true,
    });
    return shape.parse(Evaluated.parse(raw).result?.value);
  }

  /** Point the emulated screen at a built `index.html`, disguised as `tier`. */
  async load(indexHtml: string, tier: Tier): Promise<void> {
    // These accumulate, so the previous tier's disguise has to come off first:
    // otherwise loading modern after deep still reports an engine with no
    // custom properties, and the check passes on a lie.
    if (this.disguise) {
      await this.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.disguise });
      this.disguise = undefined;
    }
    const disguise = DISGUISE[tier];
    if (disguise) {
      const added = await this.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { (${disguise.toString()})(); } catch (e) {}`,
      });
      this.disguise = Added.parse(added).identifier;
    }
    await this.call(z.unknown(), setViewportSrc, 'about:blank');
    await wait(900);
    this.thrown.length = 0;
    await this.call(z.unknown(), setViewportSrc, `file://${indexHtml}`);
    await this.settle();
  }

  // Waiting a fixed span races the shell: it passed only because three tiers in
  // a row had warmed the caches, and a single tier on its own arrived at the
  // remote before the rails existed. The shell taking focus is the precondition
  // every later read actually depends on, so that is what gets waited for.
  private async settle(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await wait(500);
      const ringed = await this.call(z.string().nullable(), readFocusRing).catch(() => null);
      if (ringed) return;
    }
    throw new Error('the app never took focus in the simulator');
  }

  /** Which bundle the gate actually chose, plus what it painted. */
  async inspect(): Promise<Painted> {
    const seen = await this.call(PaintedShape.nullable(), readPainted);
    if (!seen) throw new Error('the simulator has no app in its viewport');
    return seen;
  }

  /** The label under the painted focus ring. */
  async focusRing(): Promise<string> {
    return (await this.call(z.string().nullable(), readFocusRing)) ?? 'nothing focused';
  }

  /** Press one button on the simulator's remote, then let the shell settle. */
  async press(key: RemoteKey): Promise<void> {
    const spot = await this.call(Point.nullable(), readButtonSpot, REMOTE_BUTTONS[key]);
    if (!spot) throw new Error(`simulator remote has no ${key} button`);
    for (const type of ['mousePressed', 'mouseReleased'] as const) {
      await this.send('Input.dispatchMouseEvent', { ...spot, type, button: 'left', clickCount: 1 });
    }
    await wait(900);
  }

  /** Uncaught exceptions since the last `load()`. */
  errors(): readonly string[] {
    return this.thrown;
  }

  async screenshot(path: string): Promise<void> {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(Screenshot.parse(shot).data, 'base64'));
  }

  close(): void {
    this.ws.close();
    this.proc.kill();
  }
}
