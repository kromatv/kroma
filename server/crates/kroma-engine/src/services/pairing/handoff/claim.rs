use super::reach::same_network;
use super::{Beacon, Claim, HandoffInner, Refusal, CHECK_LEN};
use crate::model::User;
use crate::services::auth::ct_eq;
use crate::services::pairing::grants::{Decided, Granted, Verdict};

#[cfg(test)]
mod tests;

// A check string is typed by a person reading a television across a room, so a
// couple of misreads are expected and a third is somebody guessing: 32^5 is far
// past three tries, and the beacon is gone before a fourth.
const MAX_WRONG_CHECKS: u32 = 3;

impl HandoffInner {
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
        match self.grants.decide(
            handle,
            rule,
            Granted {
                token,
                access_token,
                user,
            },
        ) {
            Decided::Approved => Ok(()),
            Decided::Refused(refusal) => Err(refusal),
            Decided::Gone => Err(Refusal::Gone),
        }
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
