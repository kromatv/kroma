use super::{Announce, Announced, Announcement, Claim, Handoff, Refusal};
use crate::model::User;

pub(super) const TV: &str = "192.168.1.20";

pub(super) const PHONE: &str = "192.168.1.50";

pub(super) const ELSEWHERE: &str = "10.0.0.7";

// What one household looks like to a server that is not in it: both devices
// leave through the same NAT, so both arrive wearing the same address.
pub(super) const HOUSEHOLD: &str = "203.0.113.7";

pub(super) const OTHER_HOUSEHOLD: &str = "203.0.113.9";

pub(super) fn user() -> User {
    crate::test_support::test_user("u1", vec![])
}

pub(super) fn request(device_id: &str, name: &str, ip: &str) -> Announce {
    Announce {
        device_id: device_id.into(),
        name: name.into(),
        platform: "tvOS".into(),
        ip: ip.into(),
        confirm_required: false,
    }
}

pub(super) fn try_announce(h: &Handoff, device_id: &str, name: &str, ip: &str) -> Announcement {
    h.announce(request(device_id, name, ip)).0
}

// The beacon behind an admitted announce, said once rather than at each of
// the places that only ever expects one.
pub(super) fn admitted(announcement: Announcement) -> Option<Announced> {
    match announcement {
        Announcement::Ok(announced) => Some(announced),
        Announcement::NetworkFull => None,
    }
}

pub(super) fn announce(h: &Handoff, device_id: &str, name: &str, ip: &str) -> Announced {
    admitted(try_announce(h, device_id, name, ip)).expect("this network had room")
}

// A packaged Samsung or LG shell: it presents the `null` a sandboxed page
// presents, so the server admits its beacon and holds the grant to the check
// string on the television's own screen.
pub(super) fn announce_unplaceable(h: &Handoff, device_id: &str, name: &str, ip: &str) -> Announced {
    let announcement =
        h.announce(Announce { confirm_required: true, ..request(device_id, name, ip) }).0;
    admitted(announcement).expect("this network had room")
}

pub(super) fn claim(viewer_ip: &str) -> Claim<'_> {
    Claim { viewer_ip, proof: None, check: None }
}

pub(super) fn grant(h: &Handoff, handle: &str, viewer_ip: &str) -> Result<(), Refusal> {
    h.grant(handle, claim(viewer_ip), user(), "tok".into(), "acc".into())
}

pub(super) fn grant_heard(h: &Handoff, handle: &str, viewer_ip: &str, proof: &str) -> Result<(), Refusal> {
    let heard = Claim { proof: Some(proof), ..claim(viewer_ip) };
    h.grant(handle, heard, user(), "tok".into(), "acc".into())
}

pub(super) fn grant_checked(
    h: &Handoff,
    handle: &str,
    viewer_ip: &str,
    check: &str,
) -> Result<(), Refusal> {
    let confirmed = Claim { check: Some(check), ..claim(viewer_ip) };
    h.grant(handle, confirmed, user(), "tok".into(), "acc".into())
}
