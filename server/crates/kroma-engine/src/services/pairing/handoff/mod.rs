//! Nearby handoff: a signed-out TV publishes a beacon, and a phone already
//! signed in picks that TV out of a list and hands its account over. Nothing to
//! scan, nothing to type.
//!
//! What keeps it safe is reach, not secrecy. A beacon is only ever listed to a
//! caller whose own address puts it on the same network as the TV that published
//! it, so "the TVs I can see" means "the TVs next to me" and never "every TV
//! this server knows". The handle a phone grants against is server-minted and
//! unguessable, the poll secret never leaves the TV, and the grant mints an
//! ordinary session that shows up in the account's device list like any other.
//!
//! Note what that does NOT require: that the server sit on their network. It is
//! a rendezvous, nothing more. A television and a telephone in the same room
//! pair through a server in another country, because the only address pair the
//! rule compares is theirs (see [`same_network`]).
//!
//! A beacon also carries a short check string the TV prints on its own screen,
//! so that a person facing two TVs, or facing a device that named itself after
//! theirs, can tell which row is which. Usually nobody is asked to type it. The
//! exception is a beacon raised from an origin the server could not place (a
//! packaged Samsung or LG shell, which presents the same `null` any sandboxed
//! page can): there the check is read off the television and typed on the phone,
//! because printing something on that screen is the one thing a page wearing
//! that origin cannot do.

use std::sync::Arc;

use super::grants::{Filed, Grants, Orphaned, PollState, ScopedInsert};
use super::throttle::Throttle;
use crate::services::auth::random_bytes;
use kroma_primitives::clean_label;

mod claim;
mod reach;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

pub use reach::same_network;

use reach::network_of;

/// The shape a TV's self-declared device id must have. Checked at the HTTP
/// boundary, like the cast roster's receiver ids: same rule, same reason.
pub use kroma_primitives::valid_device_id;

/// How long a beacon lives unpolled. A TV that was unplugged should leave the
/// phone's list about as fast as a person would expect it to.
pub const BEACON_TTL_SECS: i64 = 60;
/// How often the TV is told to poll. It has to poll anyway, since that is how
/// it learns it was granted, so the poll doubles as the beacon's liveness signal
/// and there is no second loop to fall out of step with it. Well inside the TTL.
pub const POLL_SECS: i64 = 3;

// Announcing is unauthenticated by design (the TV has no account yet) and is
// reachable from wherever the server is, so the store is bounded per network and
// globally behind that.
//
// The network's share REFUSES: its slots belong to the televisions that took
// them, so no caller can loop this endpoint and push a neighbour out of a
// phone's list. The global bound cannot refuse, or a flood spread across enough
// networks would lock every other network out of the store; it takes the
// least-recently-seen beacon of whichever OTHER network holds the most, so the
// flood is displaced by the televisions it was crowding out.
const MAX_BEACONS: usize = 256;
const MAX_PER_NETWORK: usize = 8;
const MAX_NAME: usize = 48;
const MAX_PLATFORM: usize = 32;

// What the endpoint itself costs, on top of the bounds above on what it may
// leave behind. A television announces once when its sign-in screen opens, again
// on a rename (webOS and Tizen both answer the device name through a bus
// callback, so a second announce at startup is the norm there), and no more
// often than every 15 seconds while a server is down. Eight televisions is a
// network's whole share of the store, so a household coming back from a power
// cut is around sixteen announces at once: the ceiling has to clear that, and
// still turns an unauthenticated loop into thirty requests a minute.
pub const MAX_ANNOUNCES_PER_MINUTE: u32 = 30;
const ANNOUNCE_WINDOW_SECS: i64 = 60;

// No I/O/0/1: the check string is read off a TV across a room and compared by
// eye, so the pairs that look alike in a sans-serif face are left out. Thirty-two
// divides 256, so `check_string`'s `%` draws from it without bias.
const CHECK_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHECK_LEN: usize = 5;

// The link proof rides a DNS-SD text record, so it stays small; 16 bytes is far
// past guessing and leaves the record comfortably inside one MTU.
const PROOF_BYTES: usize = 16;

/// What a TV says about itself when it starts waiting for an account, plus what
/// the HTTP layer made of the origin it announced from: `confirm_required` is a
/// beacon nobody could place, which is granted only against its check string.
pub struct Announce {
    pub device_id: String,
    pub name: String,
    pub platform: String,
    pub ip: String,
    pub confirm_required: bool,
}

/// What came of an announce: what the TV needs to stay listed, or that this
/// network is already holding as many beacons as it may.
pub enum Announcement {
    Ok(Announced),
    NetworkFull,
}

/// What the TV needs to keep its beacon alive and collect the account. A
/// `confirm_required` beacon is one the server could not place, so the TV has to
/// show its check string where a person can read it off the screen.
pub struct Announced {
    pub handle: String,
    pub secret: String,
    pub check: String,
    /// Published in the TV's DNS-SD record, and in nothing else. A phone that
    /// can quote it heard a link-local multicast from this TV, which does not
    /// cross a router: better evidence of being in the same room than any
    /// address this server can infer through a NAT. See [`HandoffInner::grant`].
    pub proof: String,
    pub ttl_secs: i64,
    pub poll_secs: i64,
    pub confirm_required: bool,
}

/// One waiting TV, as a phone on the same network sees it. The address it
/// announced from stays server-side: the row travels, and knowing which TV is
/// nearby is the point; knowing where it sits is not. `confirm_required` is the
/// phone's cue to ask for the check string rather than only show it.
pub struct Nearby {
    pub handle: String,
    pub name: String,
    pub platform: String,
    pub check: String,
    pub confirm_required: bool,
}

/// What a phone offers to be handed a beacon: where it is calling from, and
/// whatever it can quote of the beacon itself.
pub struct Claim<'a> {
    pub viewer_ip: &'a str,
    pub proof: Option<&'a str>,
    pub check: Option<&'a str>,
}

/// Why a grant was refused. `Gone` is an unknown handle, a lapsed beacon, one
/// already granted, or a caller that showed nothing putting it beside that
/// television: four things a caller may not tell apart.
pub enum Refusal {
    CheckRequired,
    CheckWrong,
    CheckTooMany,
    Gone,
}

struct Beacon {
    device_id: String,
    name: String,
    platform: String,
    ip: String,
    check: String,
    proof: String,
    confirm_required: bool,
    wrong_checks: u32,
}

pub struct HandoffInner {
    grants: Grants<Beacon>,
    announces: Throttle,
}

pub type Handoff = Arc<HandoffInner>;

pub fn new() -> Handoff {
    Arc::new(HandoffInner {
        grants: Grants::new(BEACON_TTL_SECS, MAX_BEACONS),
        announces: Throttle::new(MAX_ANNOUNCES_PER_MINUTE, ANNOUNCE_WINDOW_SECS),
    })
}

impl HandoffInner {
    /// Count one announce from `ip` and say whether it has asked too often.
    /// Announcing is unauthenticated by design, so the request itself carries a
    /// ceiling, well above any cadence a television keeps.
    pub fn announcing_too_often(&self, ip: &str) -> bool {
        !self.announces.admit(ip)
    }

    /// Publish (or republish) a TV's beacon. The same device replacing its own
    /// beacon drops the previous one, so a relaunched TV shows up once rather
    /// than twice; any tokens that beacon had accrued come back for deletion.
    ///
    /// One store operation, because giving up the old beacon and taking a slot
    /// for the new one are the same act: split in two, a television re-announcing
    /// into a full network loses the slot it just freed to whoever asked next.
    pub fn announce(&self, req: Announce) -> (Announcement, Vec<Orphaned>) {
        // Scoped to the network, not just to the id: a device id is not a secret
        // (it rides the cast roster too), so a global match would let anyone who
        // learned one drop that TV's beacon from anywhere. Inside its own
        // network the id is enough, and anyone there can do worse.
        let device_id = req.device_id.clone();
        let network = network_of(&req.ip);

        let check = check_string();
        let proof = hex::encode(random_bytes(PROOF_BYTES));
        let beacon = Beacon {
            device_id: req.device_id,
            name: clean_label(&req.name, MAX_NAME),
            platform: clean_label(&req.platform, MAX_PLATFORM),
            ip: req.ip,
            check: check.clone(),
            proof: proof.clone(),
            confirm_required: req.confirm_required,
            wrong_checks: 0,
        };
        let ScopedInsert { filed, orphans } = self.grants.replace_scoped(
            |b| b.device_id == device_id && network_of(&b.ip) == network,
            |b| network_of(&b.ip),
            MAX_PER_NETWORK,
            beacon,
            random_handle,
        );
        let Some(Filed { handle, secret }) = filed else {
            return (Announcement::NetworkFull, orphans);
        };
        let announced = Announced {
            handle,
            secret,
            check,
            proof,
            ttl_secs: BEACON_TTL_SECS,
            poll_secs: POLL_SECS,
            confirm_required: req.confirm_required,
        };
        (Announcement::Ok(announced), orphans)
    }

    /// Tokens of beacons that lapsed or were swept, for the caller to delete.
    pub fn take_orphans(&self) -> Vec<Orphaned> {
        self.grants.take_orphans()
    }

    /// Every TV waiting on `viewer_ip`'s own network, ordered so the list does
    /// not reshuffle between two polls.
    pub fn nearby(&self, viewer_ip: &str) -> Vec<Nearby> {
        let mut rows = self.grants.map_pending(|handle, b| {
            same_network(&b.ip, viewer_ip).then(|| Nearby {
                handle: handle.to_string(),
                name: b.name.clone(),
                platform: b.platform.clone(),
                check: b.check.clone(),
                confirm_required: b.confirm_required,
            })
        });
        rows.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.handle.cmp(&b.handle)));
        rows
    }

    /// Poll by secret. Once granted, the beacon is consumed and its tokens +
    /// user returned.
    ///
    /// A TV that is polling is a TV that is still there, so the poll is also
    /// what keeps its beacon listed. There is no separate heartbeat that could
    /// stop while the poll carries on, or carry on after the poll stops.
    pub fn poll(&self, secret: &str) -> PollState {
        self.grants.touch(secret);
        self.grants.poll(secret)
    }

    /// Take a beacon down early (the TV signed in another way, or is quitting).
    pub fn forget(&self, secret: &str) -> Option<Orphaned> {
        self.grants.forget(secret)
    }
}

fn check_string() -> String {
    random_bytes(CHECK_LEN)
        .into_iter()
        .map(|b| CHECK_ALPHABET[b as usize % CHECK_ALPHABET.len()] as char)
        .collect()
}

// Unguessable, and never read aloud: a phone only ever learns a handle by
// listing the beacons its own subnet can see.
fn random_handle() -> String {
    hex::encode(random_bytes(16))
}
