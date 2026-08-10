// What a picker of nearby televisions DOES, for the two shells that draw one.
//
// `useNearbyTvs` answers what is out there and what a grant returns. Everything
// between a tap and a row that says how it went is here instead of in either
// shell, because it is the same sequence on both and it is all edges:
//
// a beacon the server could not place is asked for its check string before
// anything is sent; a refusal the next code could fix belongs to the prompt and
// leaves the row standing; every other refusal is shown ON the tapped row; and
// the tapped row is held in the list for a few seconds either way, because both
// endings remove it (a granted beacon is spent, a lapsed one leaves on the next
// poll) and a row that vanishes under a thumb has told nobody anything.
//
// The shells keep what is genuinely theirs: pixels, and whatever else the
// platform answers with (a phone also buzzes).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiscoveredTv, FinalRefusal, GrantRefusal, GrantResult } from '../handoff';
import { checkRetryable } from '../handoff';
import type { Translate } from '../i18n';

/** How long a finished row keeps saying how it finished. `useNearbyTvs` cannot
 *  know when the reader has read it, so the picker decides, and it decides that
 *  a confirmation which never leaves is worse than none. */
export const HANDOFF_OUTCOME_MS = 4000;

export type HandoffOutcome = 'done' | FinalRefusal;

export interface HandoffAttempt {
  device: DiscoveredTv;
  /** null while the grant is still in flight. */
  outcome: HandoffOutcome | null;
}

export interface HandoffPickerOptions {
  devices: readonly DiscoveredTv[];
  connect: (device: DiscoveredTv, check?: string) => Promise<GrantResult>;
  /** Told how a grant ended, for a shell that answers with more than pixels. */
  onSettled?: (result: 'granted' | 'refused') => void;
}

export interface HandoffPicker {
  /** The devices to draw, tapped row first: it is the one the reader just acted
   *  on, and the list beneath it may reorder as televisions come and go. */
  rows: DiscoveredTv[];
  /** The one television being asked for its check string, if any. */
  asking: DiscoveredTv | null;
  /** How the tap on `device` ended, or null if it is not the tapped row. */
  outcomeFor: (device: DiscoveredTv) => HandoffOutcome | null;
  /** Tap a row: asks for the check string first when the beacon needs one. */
  start: (device: DiscoveredTv) => void;
  /** Grant outright, with a check string when one was asked for. */
  grant: (device: DiscoveredTv, check?: string) => Promise<GrantResult>;
  stopAsking: () => void;
}

export function useHandoffPicker(opts: HandoffPickerOptions): HandoffPicker {
  const { devices, connect, onSettled } = opts;
  const [attempt, setAttempt] = useState<HandoffAttempt | null>(null);
  const [asking, setAsking] = useState<DiscoveredTv | null>(null);

  useEffect(() => {
    if (!attempt?.outcome) return;
    const timer = setTimeout(() => setAttempt(null), HANDOFF_OUTCOME_MS);
    return () => clearTimeout(timer);
  }, [attempt]);

  const grant = useCallback(
    async (device: DiscoveredTv, check?: string): Promise<GrantResult> => {
      setAttempt({ device, outcome: null });
      const result = await connect(device, check);
      // The beacon went while the grant was in flight and nobody did anything
      // wrong, so there is nothing to report on the row.
      if (result === 'dropped') return result;
      if (result === 'granted') {
        setAttempt({ device, outcome: 'done' });
        setAsking(null);
        onSettled?.('granted');
        return result;
      }
      onSettled?.('refused');
      // A refusal the prompt can do something about is the prompt's to show, and
      // the row is still a row: that beacon is standing and the next code may be
      // the right one.
      if (checkRetryable(result)) {
        setAttempt(null);
        // A row this shell believed needed no code, and the server says
        // otherwise: ask for it rather than leave a tap that did nothing.
        if (result === 'checkRequired') setAsking(device);
        return result;
      }
      setAttempt({ device, outcome: result });
      setAsking(null);
      return result;
    },
    [connect, onSettled],
  );

  const start = useCallback(
    (device: DiscoveredTv) => {
      if (device.confirmRequired) {
        setAsking(device);
        return;
      }
      void grant(device);
    },
    [grant],
  );

  const rows = useMemo(() => {
    if (attempt && !devices.some((d) => d.handle === attempt.device.handle)) {
      return [attempt.device, ...devices];
    }
    return [...devices];
  }, [attempt, devices]);

  const outcomeFor = useCallback(
    (device: DiscoveredTv) => (attempt?.device.handle === device.handle ? attempt.outcome : null),
    [attempt],
  );

  const stopAsking = useCallback(() => setAsking(null), []);

  return { rows, asking, outcomeFor, start, grant, stopAsking };
}

export interface CheckPromptOptions {
  device: DiscoveredTv;
  onGrant: (device: DiscoveredTv, check: string) => Promise<GrantResult>;
}

export interface CheckPrompt {
  code: string;
  setCode: (next: string) => void;
  busy: boolean;
  /** The last refusal, which is also what makes the field read as invalid. */
  refused: GrantRefusal | null;
  submit: (value: string) => Promise<void>;
}

/** The five characters, typed. The code is uppercased on the way in on both
 *  shells: the alphabet has letters in it, a desktop browser capitalizes
 *  nothing by itself, and what a phone keyboard does is a habit rather than a
 *  guarantee. */
export function useCheckPrompt(opts: CheckPromptOptions): CheckPrompt {
  const { device, onGrant } = opts;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<GrantRefusal | null>(null);

  const type = useCallback((next: string) => setCode(next.toUpperCase()), []);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      setRefused(null);
      const result = await onGrant(device, value.toUpperCase());
      setBusy(false);
      if (result === 'granted' || result === 'dropped') return;
      setRefused(result);
      setCode('');
    },
    [device, onGrant],
  );

  return { code, setCode: type, busy, refused, submit };
}

/** The line under a row's name: what it is doing, or how it ended. */
export function handoffRowHint(
  device: DiscoveredTv,
  busy: boolean,
  outcome: HandoffOutcome | null,
  t: Translate,
): string {
  if (busy) return t('handoff.connecting');
  if (outcome) return outcome === 'done' ? t('handoff.rowDone') : t(`handoff.${outcome}`);
  // A television that has no name of its own publishes its platform as one
  // (see `deviceName` in packages/tv), so showing the platform underneath it
  // would print the same word twice.
  return device.platform === device.name ? '' : device.platform;
}
