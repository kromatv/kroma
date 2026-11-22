use super::*;
use crate::store;
use crate::test_support::{filled, get, post, Household, ACCOUNT, MACHINE};

const PIN: &str = "4821";
const DAN: &str = "7004";
const SWITCH: &str = include_str!("../../fixtures/account/switch.xml");
const RESOURCES_DAN: &str = include_str!("../../fixtures/account/resources_dan.xml");

fn switch_url(user: &str) -> String {
    format!("{ACCOUNT}/api/home/users/{user}/switch")
}

fn for_dan(sign_in: &str, pin: &str) -> UnlockAsk {
    UnlockAsk {
        sign_in: sign_in.to_string(),
        server: MACHINE.to_string(),
        user: DAN.to_string(),
        pin: pin.to_string(),
    }
}

fn dan_switches_with_his_pin(home: &Household) {
    let switch = || post(&switch_url(DAN)).with("X-Plex-Token", &home.account_token);
    home.web.answers(switch(), 401, "<errors/>");
    home.web.answers(
        switch().with("pin", PIN),
        201,
        &filled(SWITCH, &home.tokens()),
    );
    home.web.answers(
        get(&format!("{ACCOUNT}/api/v2/resources")).with("X-Plex-Token", &home.dan_account_token),
        200,
        &filled(RESOURCES_DAN, &home.tokens()),
    );
}

fn refused(reason: UnlockRefusal) -> Unlocked {
    Unlocked::Refused { reason }
}

fn dan_reader(home: &Household, sign_in: &str) -> Option<String> {
    store::reader_token(&home.pool, home.key(sign_in), DAN).unwrap()
}

#[test]
fn a_home_user_protected_by_a_pin_is_unlocked_with_it_and_reported_as_readable() {
    let (home, sign_in) = Household::signed_in();
    dan_switches_with_his_pin(&home);

    let answer = home.plex.unlock(&for_dan(&sign_in, PIN)).unwrap();
    let survey = home.plex.users(home.key(&sign_in)).unwrap();

    let dan = survey.iter().find(|user| user.id == DAN).unwrap();
    assert_eq!(answer, Unlocked::Unlocked);
    assert!(!dan.state_locked);
    assert_eq!(dan.state_needs, None);
    assert_eq!(
        dan_reader(&home, &sign_in),
        Some(home.dan_server_token.clone())
    );
}

#[test]
fn the_pin_goes_to_plex_once_in_the_form_and_in_no_address() {
    let (home, sign_in) = Household::signed_in();
    dan_switches_with_his_pin(&home);

    home.plex.unlock(&for_dan(&sign_in, PIN)).unwrap();

    let carrying: Vec<_> = home
        .web
        .seen()
        .into_iter()
        .filter(|call| call.url.contains(PIN) || call.sent.iter().any(|(_, value)| value == PIN))
        .collect();
    assert_eq!(carrying.len(), 1);
    assert_eq!(carrying[0].url, switch_url(DAN));
    assert_eq!(carrying[0].form, vec![("pin".to_string(), PIN.to_string())]);
    assert_eq!(
        carrying[0]
            .sent
            .iter()
            .filter(|(_, value)| value == PIN)
            .count(),
        1
    );
}

#[test]
fn a_pin_plex_does_not_take_is_a_wrong_pin_and_opens_nothing() {
    let (home, sign_in) = Household::signed_in();
    dan_switches_with_his_pin(&home);

    let answer = home.plex.unlock(&for_dan(&sign_in, "0000")).unwrap();

    assert_eq!(answer, refused(UnlockRefusal::Pin));
    assert_eq!(dan_reader(&home, &sign_in), None);
}

#[test]
fn a_switch_refused_because_the_owners_sign_in_ran_out_says_so() {
    let (home, sign_in) = Household::signed_in();
    dan_switches_with_his_pin(&home);
    home.web.answers(
        get(&format!("{ACCOUNT}/api/v2/user")).with("X-Plex-Token", &home.account_token),
        401,
        "<errors/>",
    );

    let answer = home.plex.unlock(&for_dan(&sign_in, "0000")).unwrap();

    assert_eq!(answer, refused(UnlockRefusal::Credentials));
}

#[test]
fn a_switch_plex_does_not_answer_is_unreachable() {
    let (home, sign_in) = Household::signed_in();
    home.web.is_silent(post(&switch_url(DAN)));

    let answer = home.plex.unlock(&for_dan(&sign_in, PIN)).unwrap();

    assert_eq!(answer, refused(UnlockRefusal::Unreachable));
}

#[test]
fn a_user_with_no_pin_on_plex_is_not_locked_and_nothing_is_switched() {
    let (home, sign_in) = Household::signed_in();
    let ben = UnlockAsk {
        user: "7002".to_string(),
        ..for_dan(&sign_in, PIN)
    };
    let nobody = UnlockAsk {
        user: "../7004".to_string(),
        ..for_dan(&sign_in, PIN)
    };

    let answers = [&ben, &nobody].map(|ask| home.plex.unlock(ask).unwrap());

    assert_eq!(
        answers,
        [
            refused(UnlockRefusal::NotLocked),
            refused(UnlockRefusal::NotLocked)
        ]
    );
    assert!(home
        .web
        .seen()
        .iter()
        .all(|call| !call.url.ends_with("/switch")));
}

#[test]
fn a_home_user_plex_gives_no_token_for_this_server_stays_locked() {
    let (home, sign_in) = Household::signed_in();
    dan_switches_with_his_pin(&home);
    home.web.answers(
        get(&format!("{ACCOUNT}/api/v2/resources")).with("X-Plex-Token", &home.dan_account_token),
        200,
        "<resources/>",
    );

    let answer = home.plex.unlock(&for_dan(&sign_in, PIN)).unwrap();

    assert_eq!(answer, refused(UnlockRefusal::Other));
    assert_eq!(dan_reader(&home, &sign_in), None);
}

#[test]
fn a_sign_in_the_importer_does_not_hold_is_a_failure() {
    let home = Household::new();

    let failed = home.plex.unlock(&for_dan("gone", PIN));

    assert!(failed.is_err());
}

#[test]
fn forgetting_the_sign_in_forgets_what_a_pin_opened() {
    let (home, sign_in) = Household::signed_in();
    dan_switches_with_his_pin(&home);
    home.plex.unlock(&for_dan(&sign_in, PIN)).unwrap();

    store::forget(&home.pool, &sign_in).unwrap();

    assert_eq!(dan_reader(&home, &sign_in), None);
    assert!(store::unlocked(&home.pool, home.key(&sign_in))
        .unwrap()
        .is_empty());
}
