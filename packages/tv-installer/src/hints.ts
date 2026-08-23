import { localNetworkBlocked, responsibleApp } from './local-network';
import { modules } from './modules/registry';

function blocked(app: string): string[] {
  return [
    `macOS is refusing ${app} the local network, so no probe can land.`,
    `Allow ${app} under System Settings, Privacy & Security, Local Network, then restart it.`,
    `That list takes no entry by hand: the request just sent on ${app}'s behalf is what lists it.`,
  ];
}

function quiet(): string[] {
  const enabling = modules()
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

/** Why a scan came back empty, most likely cause first. */
export async function diagnoseEmptyScan(): Promise<EmptyScan> {
  if (!(await localNetworkBlocked())) return { blocked: false, hints: quiet() };

  const app = (await responsibleApp()) ?? 'this terminal';
  return { blocked: true, hints: [...blocked(app), ...quiet()] };
}
