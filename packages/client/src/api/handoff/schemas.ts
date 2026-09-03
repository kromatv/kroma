import { z } from 'zod';
import { DeviceId } from '../../core/ids';
import { HandoffHandle } from './ids';

const ConfirmRequired = z.boolean().default(true);

/** `POST /handoff/announce`: what a TV waiting for an account gets back.
 * `secret` never leaves that TV; `handle` is what a phone grants against;
 * `check` is the five characters the TV prints on its own screen so a person
 * can tell two TVs apart, and read them out when asked. */
export const HandoffBeacon = z.object({
  handle: HandoffHandle,
  secret: z.string(),
  check: z.string(),
  confirmRequired: ConfirmRequired,
  /** The server's opaque per-install id, so the TV can say in its record which
   * install minted the handle. A handle means nothing to a different server,
   * and a household can easily have two. */
  instanceId: z.string(),
  /** Goes in this TV's DNS-SD record and nowhere else. A phone that can quote
   * it heard the TV on the link, so the server takes it in place of comparing
   * the two devices' addresses. */
  proof: z.string(),
  ttlSecs: z.number(),
  /** How often to poll. Polling is what keeps the beacon listed, so a TV that
   * stops polling leaves the list on its own, with no second heartbeat. */
  pollSecs: z.number(),
});
export type HandoffBeacon = z.infer<typeof HandoffBeacon>;

/** One TV waiting on the caller's own network (`GET /handoff/devices`). Carries
 * no address: which TVs are nearby is the point, where they sit is not. */
export const HandoffDevice = z.object({
  handle: HandoffHandle,
  name: z.string(),
  platform: z.string(),
  check: z.string(),
  confirmRequired: ConfirmRequired,
});
export type HandoffDevice = z.infer<typeof HandoffDevice>;

/** What a TV says about itself when it starts waiting. `deviceId` is its stable
 * per-install id; re-announcing under it replaces the TV's own row instead of
 * adding a second. `prevSecret` retires the beacon being replaced up front. */
export const HandoffAnnounce = z.object({
  deviceId: DeviceId,
  name: z.string(),
  platform: z.string(),
  prevSecret: z.string().optional(),
});
export type HandoffAnnounce = z.infer<typeof HandoffAnnounce>;

/** What a phone sends alongside the handle: why it should be believed to be
 * beside that television.
 *
 * `proof` means this device heard that TV's record on its own link rather than
 * being told about it by the server, the stronger of the two and the only one
 * that holds when the addresses cannot be reconciled. `check` is the string the
 * TV is printing, read off its screen by the person granting; it is demanded of
 * a beacon the server could not place by its origin, a screen being the one
 * thing a page pretending to be a television has not got. Case and surrounding
 * space are the server's to normalise. */
export const HandoffEvidence = z.object({
  proof: z.string().min(1).optional(),
  check: z.string().min(1).optional(),
});
export type HandoffEvidence = z.infer<typeof HandoffEvidence>;

const Label = z.string().max(64).optional();
const Token = z.string().min(1).max(128);

/** The text record a waiting TV publishes: what a phone needs to sign it in.
 *
 * `confirmRequired` is deliberately not in here and must never be: anything on
 * the link can publish one of these, so a record carrying it would let a forged
 * one wave the confirmation away. */
export const WaitingBeaconTxt = z.object({
  v: z.literal('1'),
  state: z.literal('waiting'),
  name: Label,
  platform: Label,
  /** Which install minted `handle`. A phone whose server is a different one
   * cannot grant this row and must not offer it. */
  server: Token,
  handle: Token,
  check: z.string().min(1).max(16),
  proof: Token,
});

/** The text record a signed-in TV publishes: enough to recognise it on the cast
 * roster, and nothing that authorizes anything. */
export const ReadyBeaconTxt = z.object({
  v: z.literal('1'),
  state: z.literal('ready'),
  name: Label,
  platform: Label,
  receiver: Token,
});

/** Either record, discriminated by the state the TV is in. */
export const BeaconTxt = z.discriminatedUnion('state', [WaitingBeaconTxt, ReadyBeaconTxt]);
export type BeaconTxt = z.infer<typeof BeaconTxt>;
