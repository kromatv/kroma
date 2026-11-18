use crate::store;
use crate::test_support::{
    filled, get, mint, post, Household, Seen, ACCOUNT, LOCAL, MACHINE, OWNER,
};
use crate::web::Door;
use crate::wire::{ConnectAsk, Connected, ForgetAsk, PlaysAsk, StatesAsk, SurveyAsk, TitlesAsk};

const PIN: &str = include_str!("../fixtures/account/pin.xml");
const NOW: i64 = 1_700_000_000;

fn pin(code: &str, auth_token: &str) -> String {
    filled(
        PIN,
        &[
            ("pin_id", "4242"),
            ("code", code),
            ("auth_token", auth_token),
        ],
    )
}

/// A whole import, as the core runs one: the sign-in, the survey, every page
/// of titles, watch state and plays, then the forget. Answers every call the
/// importer made.
fn a_whole_import(home: &Household) -> Vec<Seen> {
    let code = mint("code");
    home.web
        .answers(post("https://plex.tv/api/v2/pins"), 201, &pin(&code, ""));
    home.web.answers(
        get("https://plex.tv/api/v2/pins/4242"),
        200,
        &pin(&code, &home.account_token),
    );
    let Connected::Pending { pending, .. } =
        home.plex.connect(&ConnectAsk::default(), NOW).unwrap()
    else {
        panic!("a sign-in that starts is pending");
    };
    let again = ConnectAsk {
        pending: Some(pending),
    };
    let Connected::Ready { sign_in, .. } = home.plex.connect(&again, NOW + 20).unwrap() else {
        panic!("an approved sign-in is ready");
    };
    let server = MACHINE.to_string();
    let survey = SurveyAsk {
        sign_in: sign_in.clone(),
        server: server.clone(),
    };
    home.plex.survey(&survey).unwrap();
    for library in ["1", "2", "3"] {
        let titles = TitlesAsk {
            sign_in: sign_in.clone(),
            server: server.clone(),
            library: library.to_string(),
            cursor: None,
            limit: Some(500),
        };
        home.plex.titles(&titles).unwrap();
    }
    for user in [OWNER, "7002"] {
        let states = StatesAsk {
            sign_in: sign_in.clone(),
            server: server.clone(),
            user: user.to_string(),
            library: "1".to_string(),
            cursor: None,
            changed_since: None,
            limit: Some(500),
        };
        home.plex.states(&states).unwrap();
    }
    let plays = PlaysAsk {
        sign_in: sign_in.clone(),
        server,
        cursor: None,
        changed_since: Some(NOW - 86_400),
        limit: Some(500),
    };
    home.plex.plays(&plays).unwrap();
    home.plex.forget(&ForgetAsk { sign_in }).unwrap();
    home.web.seen()
}

#[test]
fn a_whole_import_changes_nothing_at_plex_the_pin_of_the_sign_in_apart() {
    let home = Household::new();

    let calls = a_whole_import(&home);

    let not_a_read: Vec<(&str, &str)> = calls
        .iter()
        .filter(|call| call.method != "GET")
        .map(|call| (call.method, call.url.as_str()))
        .collect();
    assert_eq!(not_a_read, [("POST", "https://plex.tv/api/v2/pins")]);
    assert!(calls.len() > 20);
}

#[test]
fn a_whole_import_goes_to_plex_tv_and_to_the_server_the_owner_picked_and_nowhere_else() {
    let home = Household::new();

    let calls = a_whole_import(&home);

    let elsewhere: Vec<&Seen> = calls
        .iter()
        .filter(|call| {
            let account =
                call.door == Door::Account && call.url.starts_with(&format!("{ACCOUNT}/"));
            let server = call.door == Door::Server && call.url.starts_with(&format!("{LOCAL}/"));
            !(account || server)
        })
        .collect();
    assert!(elsewhere.is_empty(), "{elsewhere:?}");
}

#[test]
fn no_token_is_ever_part_of_an_address() {
    let home = Household::new();

    let calls = a_whole_import(&home);

    let tokens = [
        &home.account_token,
        &home.owner_token,
        &home.ben_token,
        &home.chloe_token,
    ];
    let in_an_address = calls.iter().any(|call| {
        let query = call.sent.iter().filter(|(name, _)| name != "X-Plex-Token");
        tokens.iter().any(|token| {
            call.url.contains(token.as_str())
                || query
                    .clone()
                    .any(|(_, value)| value.contains(token.as_str()))
        })
    });
    assert!(!in_an_address);
}

#[test]
fn a_forgotten_sign_in_leaves_no_token_in_the_importers_database() {
    let home = Household::new();

    a_whole_import(&home);

    let conn = home.pool.get().unwrap();
    let kept: Vec<i64> = ["sign_ins", "servers", "readers", "pending"]
        .iter()
        .map(|table| {
            conn.query_row(&format!("SELECT count(*) FROM {table}"), (), |row| {
                row.get(0)
            })
            .unwrap()
        })
        .collect();
    assert_eq!(kept, [0, 0, 0, 0]);
}

#[test]
fn a_forgotten_sign_in_reads_nothing_more() {
    let (home, sign_in) = Household::signed_in();
    let forgotten = ForgetAsk {
        sign_in: sign_in.clone(),
    };
    home.plex.forget(&forgotten).unwrap();
    let asked_before = home.web.seen().len();

    let survey = home.plex.survey(&SurveyAsk {
        sign_in: sign_in.clone(),
        server: MACHINE.to_string(),
    });

    assert!(survey.is_err());
    assert!(store::sign_in(&home.pool, &sign_in).unwrap().is_none());
    assert_eq!(home.web.seen().len(), asked_before);
}

#[test]
fn forgetting_twice_is_not_an_error() {
    let (home, sign_in) = Household::signed_in();
    let ask = ForgetAsk { sign_in };
    home.plex.forget(&ask).unwrap();

    let again = home.plex.forget(&ask);

    assert!(again.is_ok());
}
