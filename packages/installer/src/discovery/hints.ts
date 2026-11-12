import { localNetworkBlocked, responsibleApp } from './local-network';
import { platforms } from '../platforms/registry';

function blocked(app: string): string[] {
  return [
    `macOS is refusing ${app} the local network, so no probe can land.`,
    `Allow ${app} under System Settings, Privacy & Security, Local Network, then restart it.`,
    `That list takes no entry by hand: the request just sent on ${app}'s behalf is what lists it.`,
  ];
}

function quiet(kinds?: readonly string[]): string[] {
  const enabling = platforms()
    .filter((module) => !kinds?.length || kinds.includes(module.id))
    .flatMap((module) => (module.enableSteps ? [`${module.label}: ${module.enableSteps}`] : []))
    .join('. ');
  return [
    'A set answers only when it is on, and only once its developer mode is enabled.',
    `${enabling}.`,
  ];
}

export interface EmptyScan {
  blocked: boolean;
  hints: string[];
}

/** Why a scan for the kinds of TV given came back empty, most likely cause first. */
export async function diagnoseEmptyScan(kinds?: readonly string[]): Promise<EmptyScan> {
  if (!(await localNetworkBlocked())) return { blocked: false, hints: quiet(kinds) };

  const app = (await responsibleApp()) ?? 'this terminal';
  return { blocked: true, hints: [...blocked(app), ...quiet(kinds)] };
}
