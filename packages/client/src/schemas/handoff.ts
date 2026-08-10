// Runtime schemas for the nearby-handoff domain: signing a TV in by picking it
// out of a list instead of carrying a code across the room. Mirrors the Rust
// `server/src/api/handoff.rs`.

import { z } from 'zod';
import { User } from './accounts';

// Whether granting this beacon costs the person a trip to the television's own
// screen. The server's word and the server's alone: it sets it for a beacon
// raised from an origin it could not place, which is the only thing that tells
// a packaged television apart from a page in a sandboxed iframe. Absent - an
// older server, a row from anywhere else - reads as required, never as
// permission.
const ConfirmRequired = z.boolean().default(true);

/** `POST /handoff/announce`: what a TV waiting for an account gets back.
 * `secret` never leaves that TV; `handle` is what a phone grants against;
 * `check` is the five characters the TV prints on its own screen so a person
 * can tell two TVs apart, and read them out when asked. */
export const HandoffBeacon = z.object({
  handle: z.string(),
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
  handle: z.string(),
  name: z.string(),
  platform: z.string(),
  check: z.string(),
  confirmRequired: ConfirmRequired,
});
export type HandoffDevice = z.infer<typeof HandoffDevice>;

/** The status-tagged union both pairing polls answer with
 * (`/auth/quickconnect/poll`, `/handoff/poll`). `expired` covers an unknown
 * secret too: a device that cannot tell them apart simply starts over. */
export const PairingStatus = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('expired') }),
  z.object({
    status: z.literal('authorized'),
    token: z.string(),
    accessToken: z.string(),
    user: User,
  }),
]);
export type PairingStatus = z.infer<typeof PairingStatus>;

// A television's own account of itself, published in the clear over DNS-SD by
// anything on the link. A trust boundary in the ordinary sense, and the bounds
// matter as much as the shape: `name` and `platform` are rendered in a picker,
// `handle` and `proof` are sent back to the server, so an unbounded record from
// a hostile device would otherwise reach both.
//
// The lengths mirror what the server allows for the same fields (MAX_NAME 48,
// MAX_PLATFORM 32 in services/pairing/handoff.rs), with room for its hex.
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
