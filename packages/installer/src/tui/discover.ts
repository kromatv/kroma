import * as p from '@clack/prompts';
import { watch } from '../discovery/scan';
import { diagnoseEmptyScan } from '../discovery/hints';
import { askForLocalNetwork, openPrivacySettings } from '../discovery/local-network';
import { platformFor } from '../platforms/registry';
import { runtimeLabel, type Television } from '../shared/television';
import { type LiveOption, liveMultiselect } from './live-multiselect';

const MAX_ROUNDS = 40;
// A sweep reports progress once per host, which is a hundred redraws a pass for
// a line that says the same thing. The terminal keeps every one of them.
const REDRAW_MS = 150;
const QUIET_ROUNDS_BEFORE_NOTICE = 2;
const WHY_SILENT = 'a TV that has not answered by now is off, or its developer mode is off';
type Doing =
  | 'scanning'
  | `scanning ${number}%`
  | 'scanning again'
  | 'nothing new'
  | 'stopped looking';

/**
 * The sets ticked, out of those of the platforms given, or of every platform
 * when none is. Null when the user cancelled.
 */
export async function discover(
  hosts?: readonly string[],
  platforms?: readonly string[],
): Promise<Television[] | null> {
  await askForLocalNetwork();

  const found = new Map<string, Television>();
  const kind = kindOf(platforms);
  let doing: Doing = 'scanning';

  const picker = liveMultiselect<string>({
    message: 'Which TVs get KROMA?',
    status: line(doing, found.size, kind),
  });
  let drawn = '';
  let drawnAt = 0;
  const say = (now = false) => {
    const status = line(doing, found.size, kind);
    const at = performance.now();
    if (!now && (status === drawn || at - drawnAt < REDRAW_MS)) return;
    drawn = status;
    drawnAt = at;
    picker.status(status);
  };

  const controller = new AbortController();
  let round = 1;
  let quiet = 0;
  let sizeWhenRoundBegan = 0;

  const scanning = watch({
    hosts,
    platforms,
    signal: controller.signal,
    onRound: (current) => {
      round = current;
      if (current > MAX_ROUNDS) {
        controller.abort();
        doing = 'stopped looking';
      } else if (current > 1) {
        const fresh = found.size > sizeWhenRoundBegan;
        quiet = fresh ? 0 : quiet + 1;
        doing = fresh ? 'scanning again' : 'nothing new';
        if (quiet === QUIET_ROUNDS_BEFORE_NOTICE) picker.notice(WHY_SILENT);
      }
      sizeWhenRoundBegan = found.size;
      say(true);
    },
    onProgress: (done, total) => {
      if (round > 1) return;
      doing = `scanning ${Math.floor((done / total) * 100)}%`;
      say();
    },
    onFound: (tv) => {
      found.set(tv.host, tv);
      picker.upsert(asOption(tv));
      if (doing === 'nothing new') doing = 'scanning again';
      say(true);
    },
  });

  const ticked = await picker.answer;
  controller.abort();
  await scanning;

  if (ticked === null) return null;
  if (found.size === 0) await explain(platforms);
  return ticked.flatMap((host) => {
    const tv = found.get(host);
    return tv ? [tv] : [];
  });
}

async function explain(platforms?: readonly string[]): Promise<void> {
  const { blocked, hints } = await diagnoseEmptyScan(platforms);
  p.note(hints.join('\n'), 'why nothing answered');
  if (!blocked) return;

  const open = await p.confirm({ message: 'Open System Settings there?', initialValue: true });
  if (p.isCancel(open) || !open) return;
  p.log.info((await openPrivacySettings()) ? 'System Settings is open' : 'could not open Settings');
}

function asOption(tv: Television): LiveOption<string> {
  const parts = [tv.vendor, runtimeLabel(tv.runtime), state(tv)];
  return {
    value: tv.host,
    label: `${tv.name}  ${tv.host}`,
    hint: parts.filter((part) => part !== '').join(' · '),
    disabled: !tv.sideloadable,
    ticked: tv.developerMode === 'on',
  };
}

function state(tv: Television): string {
  if (!tv.sideloadable) return 'takes no app';
  return tv.developerMode === 'on' ? 'ready' : platformFor(tv.platform).notReadyHint;
}

function kindOf(platforms?: readonly string[]): string {
  const [only] = platforms ?? [];
  return platforms?.length === 1 && only ? `${platformFor(only).label} TV` : 'TV';
}

function line(doing: Doing, found: number, kind: string): string {
  if (found === 0) return `${doing} · no ${kind} yet`;
  return `${doing} · ${found} ${kind}${found === 1 ? '' : 's'}`;
}
