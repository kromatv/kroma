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

use std::net::IpAddr;
use std::sync::Arc;

use super::grants::{Decided, Filed, Granted, Grants, Orphaned, PollState, ScopedInsert, Verdict};
use super::throttle::Throttle;
use crate::model::User;
use crate::services::auth::{ct_eq, random_bytes};
use kroma_primitives::clean_label;

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

// A check string is typed by a person reading a television across a room, so a
// couple of misreads are expected and a third is somebody guessing: 32^5 is far
// past three tries, and the beacon is gone before a fourth.
const MAX_WRONG_CHECKS: u32 = 3;

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

    /// Hand `user`'s freshly-minted tokens to the TV behind `handle`.
    ///
    /// The caller must first show something that puts it beside that TV, and
    /// either will do:
    ///
    /// - the addresses agree ([`same_network`]), which is all a phone that found
    ///   the TV through this server can offer;
    /// - or the caller quotes the beacon's `proof`, which is published in the
    ///   TV's DNS-SD record and nowhere else. Multicast does not leave the link,
    ///   so quoting it is proof of having been on it. Unlike the addresses, it
    ///   holds across a routed home and a dual-stack one, and cannot be claimed
    ///   by a stranger who merely shares a public address under CGNAT.
    ///
    /// A beacon nobody could place asks for `check` on top of that, never
    /// instead of it, and is burnt after `MAX_WRONG_CHECKS` wrong answers. Case
    /// and spacing do not matter: it was read off a screen across a room.
    pub fn grant(
        &self,
        handle: &str,
        claim: Claim<'_>,
        user: User,
        token: String,
        access_token: String,
    ) -> Result<(), Refusal> {
        let rule = |b: &mut Beacon| {
            if !in_reach(b, claim.viewer_ip, claim.proof) {
                return Verdict::Refuse(Refusal::Gone);
            }
            if !b.confirm_required {
                return Verdict::Approve;
            }
            confirmed(b, claim.check)
        };
        match self.grants.decide(handle, rule, Granted { token, access_token, user }) {
            Decided::Approved => Ok(()),
            Decided::Refused(refusal) => Err(refusal),
            Decided::Gone => Err(Refusal::Gone),
        }
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

fn in_reach(beacon: &Beacon, viewer_ip: &str, proof: Option<&str>) -> bool {
    same_network(&beacon.ip, viewer_ip)
        || proof.is_some_and(|p| ct_eq(beacon.proof.as_bytes(), p.as_bytes()))
}

fn confirmed(beacon: &mut Beacon, check: Option<&str>) -> Verdict<Refusal> {
    let typed = normalized_check(check.unwrap_or_default());
    if typed.is_empty() {
        return Verdict::Refuse(Refusal::CheckRequired);
    }
    if ct_eq(beacon.check.as_bytes(), typed.as_bytes()) {
        return Verdict::Approve;
    }
    beacon.wrong_checks += 1;
    match beacon.wrong_checks >= MAX_WRONG_CHECKS {
        true => Verdict::Burn(Refusal::CheckTooMany),
        false => Verdict::Refuse(Refusal::CheckWrong),
    }
}

// One character past the length, so an overlong answer fails on length rather
// than being truncated into a match, and the work stays bounded whatever a
// caller sends.
fn normalized_check(typed: &str) -> String {
    typed
        .chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(char::to_uppercase)
        .take(CHECK_LEN + 1)
        .collect()
}

/// Whether two client addresses put their devices on one network, as seen from
/// wherever the server happens to sit. That is the only question this feature
/// asks: the server is a rendezvous, and whether it shares a network with either
/// device is beside the point. A TV and a phone in the same room must find each
/// other through a server on the other side of the world.
///
/// Which makes the comparison depend on how the two got here:
///
/// - **Private IPv4** (the server is on their network, seeing them directly):
///   same /24. One home spans `192.168.1.20` on ethernet and `192.168.1.50` on
///   wifi, so equality would be too strict.
/// - **Public IPv4** (the server is elsewhere, seeing them through their NAT):
///   the very same address. A household leaves through one, so equality is what
///   "together" means here, and /24 across the open internet would be far too
///   loose.
/// - **IPv6**, either way: same /64. That is one prefix delegation, which is one
///   LAN, whether the addresses are unique-local or global.
///
/// Two limits worth knowing, both of which fall back to the code on the screen:
/// a home routed across several subnets, and a dual-stack home where one device
/// arrives over IPv6 and the other over IPv4.
pub fn same_network(a: &str, b: &str) -> bool {
    matches!((network_of(a), network_of(b)), (Some(a), Some(b)) if a == b)
}

// The rule above as a value, so the store can also GROUP beacons by network
// (which one holds the most) and not only compare two of them. None is an
// address that places its device nowhere: it is nobody's neighbour, and the
// store holds the lot of them on one share.
#[derive(PartialEq, Eq, Hash)]
enum Network {
    Subnet([u8; 3]),
    Address(std::net::Ipv4Addr),
    Delegation([u8; 8]),
}

fn network_of(ip: &str) -> Option<Network> {
    match host(ip)? {
        IpAddr::V4(v4) if behind_one_router(&v4) => {
            let [a, b, c, _] = v4.octets();
            Some(Network::Subnet([a, b, c]))
        }
        IpAddr::V4(v4) => Some(Network::Address(v4)),
        IpAddr::V6(v6) => Some(Network::Delegation(v6.octets()[..8].try_into().ok()?)),
    }
}

// An address the server can only be seeing because it sits on the same network
// as its owner: nothing routes these across the internet.
fn behind_one_router(ip: &std::net::Ipv4Addr) -> bool {
    ip.is_private() || ip.is_loopback() || ip.is_link_local()
}

// `::ffff:192.168.1.4` and `192.168.1.4` are one host reached over a dual-stack
// socket, so they have to compare as one family.
fn host(ip: &str) -> Option<IpAddr> {
    match ip.trim().parse().ok()? {
        IpAddr::V6(v6) => Some(v6.to_ipv4_mapped().map_or(IpAddr::V6(v6), IpAddr::V4)),
        v4 => Some(v4),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::pairing::approved;

    const TV: &str = "192.168.1.20";
    const PHONE: &str = "192.168.1.50";
    const ELSEWHERE: &str = "10.0.0.7";
    // What one household looks like to a server that is not in it: both devices
    // leave through the same NAT, so both arrive wearing the same address.
    const HOUSEHOLD: &str = "203.0.113.7";
    const OTHER_HOUSEHOLD: &str = "203.0.113.9";

    fn user() -> User {
        crate::test_support::test_user("u1", vec![])
    }

    fn request(device_id: &str, name: &str, ip: &str) -> Announce {
        Announce {
            device_id: device_id.into(),
            name: name.into(),
            platform: "tvOS".into(),
            ip: ip.into(),
            confirm_required: false,
        }
    }

    fn try_announce(h: &Handoff, device_id: &str, name: &str, ip: &str) -> Announcement {
        h.announce(request(device_id, name, ip)).0
    }

    // The beacon behind an admitted announce, said once rather than at each of
    // the places that only ever expects one.
    fn admitted(announcement: Announcement) -> Option<Announced> {
        match announcement {
            Announcement::Ok(announced) => Some(announced),
            Announcement::NetworkFull => None,
        }
    }

    fn announce(h: &Handoff, device_id: &str, name: &str, ip: &str) -> Announced {
        admitted(try_announce(h, device_id, name, ip)).expect("this network had room")
    }

    // A packaged Samsung or LG shell: it presents the `null` a sandboxed page
    // presents, so the server admits its beacon and holds the grant to the check
    // string on the television's own screen.
    fn announce_unplaceable(h: &Handoff, device_id: &str, name: &str, ip: &str) -> Announced {
        let announcement =
            h.announce(Announce { confirm_required: true, ..request(device_id, name, ip) }).0;
        admitted(announcement).expect("this network had room")
    }

    fn claim(viewer_ip: &str) -> Claim<'_> {
        Claim { viewer_ip, proof: None, check: None }
    }

    fn grant(h: &Handoff, handle: &str, viewer_ip: &str) -> Result<(), Refusal> {
        h.grant(handle, claim(viewer_ip), user(), "tok".into(), "acc".into())
    }

    fn grant_heard(h: &Handoff, handle: &str, viewer_ip: &str, proof: &str) -> Result<(), Refusal> {
        let heard = Claim { proof: Some(proof), ..claim(viewer_ip) };
        h.grant(handle, heard, user(), "tok".into(), "acc".into())
    }

    fn grant_checked(
        h: &Handoff,
        handle: &str,
        viewer_ip: &str,
        check: &str,
    ) -> Result<(), Refusal> {
        let confirmed = Claim { check: Some(check), ..claim(viewer_ip) };
        h.grant(handle, confirmed, user(), "tok".into(), "acc".into())
    }

    #[test]
    fn a_phone_on_the_same_subnet_sees_the_waiting_tv() {
        let h = new();
        let announced = announce(&h, "tv-salon-01", "Salon", TV);
        let rows = h.nearby(PHONE);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "Salon");
        assert_eq!(rows[0].platform, "tvOS");
        assert_eq!(rows[0].handle, announced.handle);
        // The check string is the TV's, so the two screens agree.
        assert_eq!(rows[0].check, announced.check);
    }

    #[test]
    fn a_phone_on_another_subnet_sees_nothing() {
        let h = new();
        announce(&h, "tv-salon-01", "Salon", TV);
        assert!(h.nearby(ELSEWHERE).is_empty());
    }

    #[test]
    fn granting_hands_the_tv_the_account_it_was_waiting_for() {
        let h = new();
        let tv = announce(&h, "tv-salon-01", "Salon", TV);
        assert!(matches!(h.poll(&tv.secret), PollState::Pending));
        assert!(grant(&h, &tv.handle, PHONE).is_ok());

        let (token, access_token, user) =
            approved(h.poll(&tv.secret)).expect("the granted session");
        assert_eq!((token.as_str(), access_token.as_str()), ("tok", "acc"));
        assert_eq!(user.id, "u1");
    }

    #[test]
    fn a_handle_learned_elsewhere_is_useless_off_the_tvs_subnet() {
        let h = new();
        let tv = announce(&h, "tv-salon-01", "Salon", TV);
        assert!(grant(&h, &tv.handle, ELSEWHERE).is_err());
        assert!(matches!(h.poll(&tv.secret), PollState::Pending));
    }

    #[test]
    fn an_unknown_handle_is_refused() {
        let h = new();
        assert!(grant(&h, "deadbeef", PHONE).is_err());
    }

    #[test]
    fn a_relaunched_tv_replaces_its_own_row_instead_of_adding_one() {
        let h = new();
        let first = announce(&h, "tv-salon-01", "Salon", TV);
        let second = announce(&h, "tv-salon-01", "Salon", TV);
        assert_ne!(first.handle, second.handle);
        assert_eq!(h.nearby(PHONE).len(), 1);
        assert!(matches!(h.poll(&first.secret), PollState::Unknown));
    }

    #[test]
    fn replacing_a_beacon_granted_in_the_gap_surrenders_its_tokens() {
        let h = new();
        let first = announce(&h, "tv-salon-01", "Salon", TV);
        assert!(grant(&h, &first.handle, PHONE).is_ok());

        let (_, orphans) = h.announce(request("tv-salon-01", "Salon", TV));
        assert_eq!(orphans.len(), 1);
        assert_eq!(orphans[0].token, "tok");
    }

    #[test]
    fn two_tvs_are_listed_by_name_and_keep_that_order() {
        let h = new();
        announce(&h, "tv-chambre-01", "Chambre", TV);
        announce(&h, "tv-salon-01", "Salon", TV);
        let names: Vec<String> = h.nearby(PHONE).into_iter().map(|r| r.name).collect();
        assert_eq!(names, vec!["Chambre".to_string(), "Salon".to_string()]);
    }

    #[test]
    fn polling_keeps_a_beacon_listed_and_leaving_takes_it_down() {
        let h = new();
        let tv = announce(&h, "tv-salon-01", "Salon", TV);
        assert!(matches!(h.poll(&tv.secret), PollState::Pending));
        assert_eq!(h.nearby(PHONE).len(), 1);

        assert!(h.forget(&tv.secret).is_none());
        assert!(h.nearby(PHONE).is_empty());
        assert!(matches!(h.poll(&tv.secret), PollState::Unknown));
    }

    #[test]
    fn a_beacon_nobody_polls_lapses_out_of_the_list() {
        // A store whose entries are stale the instant they are filed: what the
        // TTL does to a TV that was unplugged, without waiting a minute for it.
        let h = Arc::new(HandoffInner {
            grants: Grants::new(0, MAX_BEACONS),
            announces: Throttle::new(MAX_ANNOUNCES_PER_MINUTE, ANNOUNCE_WINDOW_SECS),
        });
        let tv = announce(&h, "tv-salon-01", "Salon", TV);
        assert!(h.nearby(PHONE).is_empty());
        assert!(matches!(h.poll(&tv.secret), PollState::Unknown));
    }

    #[test]
    fn a_tv_that_names_itself_with_a_newline_cannot_forge_a_row() {
        let h = new();
        h.announce(Announce {
            platform: "  \u{7}tvOS  ".into(),
            ..request("tv-salon-01", &format!("Salon\nAdministrateur{}", "x".repeat(80)), TV)
        });
        let row = &h.nearby(PHONE)[0];
        assert!(!row.name.contains('\n'));
        assert_eq!(row.name.chars().count(), MAX_NAME);
        assert_eq!(row.platform, "tvOS");
    }

    #[test]
    fn the_check_string_is_short_and_free_of_look_alike_characters() {
        for _ in 0..64 {
            let check = check_string();
            assert_eq!(check.len(), CHECK_LEN);
            assert!(check.bytes().all(|b| CHECK_ALPHABET.contains(&b)), "{check}");
        }
    }

    #[test]
    fn every_letter_of_the_check_alphabet_is_as_likely_as_every_other() {
        // `check_string` folds a random byte with `%`, which is only unbiased
        // while the alphabet divides the byte range exactly.
        assert_eq!(256 % CHECK_ALPHABET.len(), 0);
        let mut sorted = CHECK_ALPHABET.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), CHECK_ALPHABET.len(), "a repeated letter is a heavier one");
    }

    #[test]
    fn a_beacon_nobody_could_place_says_so_to_the_television_and_to_the_phone() {
        let h = new();
        let placed = announce(&h, "tv-salon-01", "Salon", TV);
        assert!(!placed.confirm_required);

        let shell = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
        assert!(shell.confirm_required);

        let rows = h.nearby(PHONE);
        let row_of = |handle: &str| {
            rows.iter().find(|r| r.handle == handle).expect("a row").confirm_required
        };
        assert!(row_of(&shell.handle));
        assert!(!row_of(&placed.handle));
    }

    #[test]
    fn a_beacon_nobody_could_place_is_not_granted_without_its_check() {
        let h = new();
        let tv = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
        assert!(matches!(grant(&h, &tv.handle, PHONE), Err(Refusal::CheckRequired)));
        assert!(matches!(grant_checked(&h, &tv.handle, PHONE, "   "), Err(Refusal::CheckRequired)));
        assert!(matches!(grant_checked(&h, &tv.handle, PHONE, "WRONG"), Err(Refusal::CheckWrong)));
        assert!(matches!(h.poll(&tv.secret), PollState::Pending));

        assert!(grant_checked(&h, &tv.handle, PHONE, &tv.check).is_ok());
        assert!(matches!(h.poll(&tv.secret), PollState::Authorized { .. }));
    }

    #[test]
    fn the_check_was_read_off_a_screen_so_case_and_spacing_do_not_matter() {
        let h = new();
        let tv = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
        let typed = format!("  {}  ", tv.check.to_lowercase());
        assert!(grant_checked(&h, &tv.handle, PHONE, &typed).is_ok());
    }

    #[test]
    fn a_beacon_that_was_placed_ignores_a_check_sent_anyway() {
        let h = new();
        let tv = announce(&h, "tv-salon-01", "Salon", TV);
        assert!(grant_checked(&h, &tv.handle, PHONE, "WRONG").is_ok());
    }

    #[test]
    fn three_wrong_checks_take_the_beacon_down_for_good() {
        let h = new();
        let tv = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
        let wrong = || grant_checked(&h, &tv.handle, PHONE, "WRONG");
        assert!(matches!(wrong(), Err(Refusal::CheckWrong)));
        assert!(matches!(wrong(), Err(Refusal::CheckWrong)));
        assert!(matches!(wrong(), Err(Refusal::CheckTooMany)));

        // Gone, so even the right answer buys nothing and the TV starts over.
        assert!(matches!(grant_checked(&h, &tv.handle, PHONE, &tv.check), Err(Refusal::Gone)));
        assert!(matches!(h.poll(&tv.secret), PollState::Unknown));
        assert!(h.nearby(PHONE).is_empty());
    }

    #[test]
    fn a_caller_out_of_reach_never_learns_whether_its_check_was_right() {
        // Nor may it spend the beacon's tries: the check is what a caller in the
        // room adds to the address rule, never a way around it.
        let h = new();
        let tv = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
        for _ in 0..5 {
            assert!(matches!(
                grant_checked(&h, &tv.handle, ELSEWHERE, &tv.check),
                Err(Refusal::Gone)
            ));
        }
        assert!(grant_checked(&h, &tv.handle, PHONE, &tv.check).is_ok());
    }

    #[test]
    fn one_address_announcing_far_past_any_cadence_is_refused() {
        let h = new();
        for attempt in 1..=MAX_ANNOUNCES_PER_MINUTE {
            assert!(!h.announcing_too_often(TV), "refused announce {attempt}");
        }
        assert!(h.announcing_too_often(TV));
        // And it costs the household next door nothing.
        assert!(!h.announcing_too_often(HOUSEHOLD));
    }

    #[test]
    fn a_full_networks_worth_of_televisions_never_reaches_the_ceiling() {
        // Every television of a network's whole share coming back from a power
        // cut: one announce each, then a rename apiece (webOS and Tizen both
        // learn their own name a beat after the first announce).
        let h = new();
        for _ in 0..(MAX_PER_NETWORK * 2) {
            assert!(!h.announcing_too_often(TV));
        }
    }

    #[test]
    fn handles_do_not_repeat() {
        let h = new();
        let mut seen = std::collections::HashSet::new();
        // One per network: the share is eight, and this is about the handles.
        for i in 0..16 {
            let tv = announce(&h, &format!("tv-{i:04}-xxxx"), "Salon", &format!("192.168.{i}.20"));
            assert!(seen.insert(tv.handle), "handle repeated");
        }
    }

    #[test]
    fn a_server_somewhere_else_still_pairs_a_tv_and_a_phone_in_one_room() {
        // The server is on another network entirely, so it never sees either
        // device's own address: both arrive through their household's NAT.
        let h = new();
        let tv = announce(&h, "tv-salon-01", "Salon", HOUSEHOLD);

        assert_eq!(h.nearby(HOUSEHOLD).len(), 1);
        assert!(grant(&h, &tv.handle, HOUSEHOLD).is_ok());
        assert!(matches!(h.poll(&tv.secret), PollState::Authorized { .. }));
    }

    #[test]
    fn a_phone_leaving_through_another_router_is_not_in_the_room() {
        let h = new();
        let tv = announce(&h, "tv-salon-01", "Salon", HOUSEHOLD);
        // Next door, or the same phone on cellular: a different way out.
        assert!(h.nearby(OTHER_HOUSEHOLD).is_empty());
        assert!(grant(&h, &tv.handle, OTHER_HOUSEHOLD).is_err());
    }

    #[test]
    fn a_phone_that_heard_the_tv_may_grant_from_anywhere_the_addresses_disagree() {
        // The routed home and the dual-stack home both look like this: two
        // devices in one room whose addresses this server cannot reconcile.
        let h = new();
        let tv = announce(&h, "tv-salon-01", "Salon", TV);
        assert!(grant(&h, &tv.handle, ELSEWHERE).is_err());

        // Quoting the proof is quoting a multicast that never left the link.
        assert!(grant_heard(&h, &tv.handle, ELSEWHERE, &tv.proof).is_ok());
        assert!(matches!(h.poll(&tv.secret), PollState::Authorized { .. }));
    }

    #[test]
    fn a_proof_that_is_not_this_beacons_is_worth_nothing() {
        let h = new();
        let salon = announce(&h, "tv-salon-01", "Salon", TV);
        let chambre = announce(&h, "tv-chambre-01", "Chambre", TV);

        // Another beacon's proof, and an invented one, both fail.
        assert!(grant_heard(&h, &salon.handle, ELSEWHERE, &chambre.proof).is_err());
        assert!(grant_heard(&h, &salon.handle, ELSEWHERE, "00").is_err());
        assert!(matches!(h.poll(&salon.secret), PollState::Pending));
    }

    #[test]
    fn every_beacon_gets_its_own_proof() {
        let h = new();
        let mut seen = std::collections::HashSet::new();
        for i in 0..16 {
            let tv = announce(&h, &format!("tv-{i:04}-xxxx"), "Salon", &format!("192.168.{i}.20"));
            assert_eq!(tv.proof.len(), PROOF_BYTES * 2, "hex of {PROOF_BYTES} bytes");
            assert!(seen.insert(tv.proof), "proof repeated");
        }
    }

    #[test]
    fn a_device_id_learned_elsewhere_cannot_drop_that_tvs_beacon() {
        let h = new();
        let mine = announce(&h, "tv-salon-01", "Salon", TV);
        // A device id is not a secret. Announcing it from another network must
        // not take my beacon down.
        announce(&h, "tv-salon-01", "Impostor", HOUSEHOLD);

        assert_eq!(h.nearby(PHONE).len(), 1);
        assert_eq!(h.nearby(PHONE)[0].name, "Salon");
        assert!(matches!(h.poll(&mine.secret), PollState::Pending));
    }

    #[test]
    fn a_full_network_refuses_the_next_television_rather_than_evicting_one() {
        // The share belongs to the devices that took it. Evicting would let a
        // caller loop this endpoint and keep every real television out of every
        // phone's list.
        let h = new();
        let first = announce(&h, "tv-0000-xxxx", "Salon", HOUSEHOLD);
        for i in 1..MAX_PER_NETWORK {
            announce(&h, &format!("tv-{i:04}-xxxx", i = i), "Flood", HOUSEHOLD);
        }
        assert_eq!(h.nearby(HOUSEHOLD).len(), MAX_PER_NETWORK);

        assert!(admitted(try_announce(&h, "tv-late-xxxx", "Late", HOUSEHOLD)).is_none());
        // Nobody was pushed out, and the one that was there still works.
        assert_eq!(h.nearby(HOUSEHOLD).len(), MAX_PER_NETWORK);
        assert!(matches!(h.poll(&first.secret), PollState::Pending));
    }

    #[test]
    fn a_full_network_does_not_stop_another_one() {
        let h = new();
        for i in 0..MAX_PER_NETWORK {
            announce(&h, &format!("tv-{i:04}-xxxx", i = i), "Flood", HOUSEHOLD);
        }
        let mine = announce(&h, "tv-salon-01", "Salon", TV);
        assert_eq!(h.nearby(PHONE).len(), 1);
        assert!(matches!(h.poll(&mine.secret), PollState::Pending));
    }

    #[test]
    fn a_flood_spread_over_many_networks_pays_for_the_next_honest_television() {
        // Enough networks each holding their full share to fill the store. They
        // are cheap to come by (a routed home gives every /64 one of its own),
        // which is how a flood used to shut every other network out entirely.
        let h = new();
        let mut flood = Vec::new();
        for network in 0..(MAX_BEACONS / MAX_PER_NETWORK) {
            for tv in 0..MAX_PER_NETWORK {
                let ip = format!("203.0.113.{}", network + 1);
                flood.push(announce(&h, &format!("tv-{network:02}{tv:02}-xxxx"), "Flood", &ip));
            }
        }

        let mine = announce(&h, "tv-salon-01", "Salon", TV);
        assert_eq!(h.nearby(PHONE).len(), 1);
        assert!(matches!(h.poll(&mine.secret), PollState::Pending));
        // And what it cost is the flood's oldest beacon, never a bystander's.
        assert!(matches!(h.poll(&flood[0].secret), PollState::Unknown));
        assert!(matches!(h.poll(&flood[MAX_PER_NETWORK].secret), PollState::Pending));
    }

    #[test]
    fn a_television_re_announcing_into_a_full_network_still_gets_its_slot_back() {
        // It gives up its own beacon first, so the share it re-enters is the
        // one it already held.
        let h = new();
        announce(&h, "tv-mine-xxxx", "Salon", HOUSEHOLD);
        for i in 1..MAX_PER_NETWORK {
            announce(&h, &format!("tv-{i:04}-xxxx", i = i), "Flood", HOUSEHOLD);
        }
        let again = announce(&h, "tv-mine-xxxx", "Salon", HOUSEHOLD);
        assert!(matches!(h.poll(&again.secret), PollState::Pending));
    }

    #[test]
    fn a_beacon_already_granted_stops_being_listed() {
        // Its television is seconds from signing in, and a second grant is
        // refused, so offering the row again could only fail.
        let h = new();
        let tv = announce(&h, "tv-salon-01", "Salon", TV);
        assert_eq!(h.nearby(PHONE).len(), 1);

        assert!(grant(&h, &tv.handle, PHONE).is_ok());
        assert!(h.nearby(PHONE).is_empty(), "a spent beacon is not on offer");
    }

    #[test]
    fn a_second_phone_cannot_grant_a_beacon_already_taken() {
        let h = new();
        let tv = announce(&h, "tv-salon-01", "Salon", TV);
        assert!(grant(&h, &tv.handle, PHONE).is_ok());
        let second = h.grant(&tv.handle, claim(PHONE), user(), "tok2".into(), "acc2".into());
        assert!(second.is_err());

        let (token, ..) = approved(h.poll(&tv.secret)).expect("the first grant");
        assert_eq!(token, "tok");
    }

    #[test]
    fn same_network_is_the_subnet_when_the_server_sees_them_directly() {
        // Private addresses: one home spans .20 on ethernet and .50 on wifi.
        assert!(same_network("192.168.1.20", "192.168.1.50"));
        assert!(same_network("127.0.0.1", "127.0.0.1"));
        assert!(!same_network("192.168.1.20", "192.168.2.50"));
        assert!(!same_network("192.168.1.20", "10.0.0.7"));
        // A dual-stack socket reports the same host two ways.
        assert!(same_network("::ffff:192.168.1.20", "192.168.1.50"));
    }

    #[test]
    fn same_network_is_the_very_address_when_the_server_is_elsewhere() {
        // Public IPv4: a household leaves through one address, so that address
        // IS the network. A /24 here would span strangers.
        assert!(same_network("203.0.113.7", "203.0.113.7"));
        assert!(!same_network("203.0.113.7", "203.0.113.9"));
        // A private address and a public one are never the same place, whichever
        // way round they come.
        assert!(!same_network("192.168.1.20", "203.0.113.7"));
        assert!(!same_network("203.0.113.7", "192.168.1.20"));
    }

    #[test]
    fn same_network_is_the_prefix_delegation_over_ipv6() {
        // One /64 is one LAN, unique-local or global alike.
        assert!(same_network("fd00:1234:5678:9abc::1", "fd00:1234:5678:9abc::2"));
        assert!(!same_network("fd00:1234:5678:9abc::1", "fd00:1234:5678:9abd::1"));
        assert!(same_network("2001:db8:1:2::1", "2001:db8:1:2::99"));
        assert!(!same_network("2001:db8:1:2::1", "2001:db8:1:3::1"));
    }

    #[test]
    fn an_address_that_is_not_one_is_nowhere() {
        // Families never match across, and an unparseable address matches nothing.
        assert!(!same_network("192.168.1.20", "fd00::1"));
        assert!(!same_network("not-an-ip", "192.168.1.50"));
        assert!(!same_network("192.168.1.20", ""));
    }

    #[test]
    fn the_share_is_per_network_and_the_bound_that_bites_is_that_one() {
        let h = new();
        for i in 0..MAX_PER_NETWORK {
            announce(&h, &format!("tv-{i:04}-xxxx", i = i), "Salon", TV);
        }
        assert_eq!(h.nearby(PHONE).len(), MAX_PER_NETWORK);
        assert!(admitted(try_announce(&h, "tv-late-xxxx", "Late", TV)).is_none());
    }
}
