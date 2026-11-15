use super::*;
use crate::services::sso::testing::FakeProvider;

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn unreadable() -> FakeProvider {
    let idp = FakeProvider::start();
    idp.advertise_algorithms(&["HS256"]);
    idp
}

#[test]
fn a_provider_that_could_not_be_read_is_left_alone_for_half_a_minute() {
    let idp = unreadable();
    let directory = Directory::default();
    let at = now();

    let first = directory.lookup(&idp.issuer, at).err();
    let too_soon = directory.lookup(&idp.issuer, at + 29).err();
    let later = directory.lookup(&idp.issuer, at + 30).err();

    assert_eq!(first, Some(DiscoveryError::Algorithm));
    assert_eq!(too_soon, Some(DiscoveryError::Algorithm));
    assert_eq!(later, Some(DiscoveryError::Algorithm));
    let calls = idp.calls();
    assert_eq!(calls.iter().filter(|c| *c == "discovery").count(), 2);
}

#[test]
fn a_fresh_read_that_succeeds_ends_the_wait() {
    let idp = unreadable();
    let directory = Directory::default();
    let at = now();
    directory.lookup(&idp.issuer, at).unwrap_err();
    idp.advertise_algorithms(&["RS256"]);

    let held_back = directory.lookup(&idp.issuer, at + 1);
    let fresh = directory.read(&idp.issuer, at + 2);
    let after = directory.lookup(&idp.issuer, at + 3);

    assert!(held_back.is_err());
    assert!(fresh.is_ok());
    assert!(after.is_ok());
}

#[test]
fn while_one_caller_reads_the_others_get_what_was_remembered() {
    let idp = FakeProvider::start();
    let directory = Directory::default();
    let at = now();
    directory.lookup(&idp.issuer, at).unwrap();
    let stale = at + REMEMBERED_SECS;
    directory.begin_reading(&idp.issuer, stale).unwrap();

    let meanwhile = directory.lookup(&idp.issuer, stale + 1);

    assert!(meanwhile.is_ok());
    let calls = idp.calls();
    assert_eq!(calls.iter().filter(|c| *c == "discovery").count(), 1);
}

#[test]
fn while_one_caller_reads_a_provider_nobody_has_read_the_others_are_turned_away() {
    let directory = Directory::default();
    let at = now();
    directory.begin_reading("https://id.test", at).unwrap();

    let meanwhile = directory.lookup("https://id.test", at + 1);

    assert!(matches!(meanwhile, Err(DiscoveryError::Unreachable(_))));
}
