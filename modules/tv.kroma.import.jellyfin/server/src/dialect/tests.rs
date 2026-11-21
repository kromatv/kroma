use serde_json::json;

use super::*;
use crate::test_support::{Recorded, World, ADDRESS, LEO, SERVER};
use crate::wire::{Connected, Refusal, Survey, SurveyAsk};

#[test]
fn the_sign_in_is_the_only_call_that_is_not_a_read() {
    for dialect in [&JELLYFIN, &EMBY] {
        let writes: Vec<Call> = dialect
            .calls()
            .into_iter()
            .filter(|call| call.method != Method::Get)
            .collect();

        assert_eq!(writes, vec![dialect.sign_in]);
    }
}

#[test]
fn a_jellyfin_or_an_emby_on_this_machine_is_looked_for_at_its_default_port() {
    let addresses = [JELLYFIN.local_address, EMBY.local_address];

    assert_eq!(
        addresses,
        ["http://127.0.0.1:8096", "http://127.0.0.1:8096"]
    );
}

#[test]
fn every_emby_call_is_made_under_the_api_prefix() {
    let paths: Vec<&str> = EMBY.calls().iter().map(|call| call.path).collect();

    assert!(
        paths.iter().all(|path| path.starts_with("/emby/")),
        "{paths:?}"
    );
}

fn surveyed(world: &World) -> Survey {
    let ask = SurveyAsk {
        sign_in: world.signed_in(),
        server: SERVER.to_string(),
    };
    world.importer.survey(&ask).unwrap()
}

#[test]
fn an_emby_administrator_signs_in_under_the_emby_scheme() {
    let world = World::over(Recorded::emby());

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    let signed_in = world.jellyfin.seen(|seen| {
        let call = seen
            .iter()
            .find(|call| call.path == EMBY.sign_in.path)
            .unwrap();
        call.authorization.clone().unwrap_or_default()
    });
    let Connected::Ready { servers, .. } = answer else {
        panic!("the sign-in was refused");
    };
    assert_eq!(servers[0].name, "Den");
    assert!(
        signed_in.starts_with("Emby Client=\"KROMA\""),
        "{signed_in}"
    );
    assert!(!signed_in.contains("Token="));
}

#[test]
fn a_jellyfin_is_not_taken_for_an_emby() {
    let jellyfin = json!({ "ServerName": "Living room", "Version": "12.4.0", "ProductName": "Jellyfin Server", "Id": SERVER });
    let world = World::over(Recorded::emby().on(EMBY.server.path, &[], jellyfin));

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    let Connected::Refused { reason, message } = answer else {
        panic!("a Jellyfin was taken for an Emby");
    };
    assert_eq!(reason, Refusal::Unsupported);
    assert_eq!(message.as_deref(), Some("Jellyfin Server 12.4.0"));
}

#[test]
fn an_emby_is_not_taken_for_a_jellyfin() {
    let emby = json!({ "ServerName": "Den", "Version": "4.8.11.0", "Id": SERVER });
    let world = World::over(Recorded::jellyfin().on(JELLYFIN.server.path, &[], emby));

    let answer = world.importer.connect(&world.form(ADDRESS, "sam")).unwrap();

    assert!(matches!(
        answer,
        Connected::Refused {
            reason: Refusal::Unsupported,
            ..
        }
    ));
}

#[test]
fn the_survey_reads_emby_users_and_libraries_from_their_query_pages() {
    let world = World::over(Recorded::emby());

    let survey = surveyed(&world);

    let libraries: Vec<&str> = survey.libraries.iter().map(|l| l.name.as_str()).collect();
    let users: Vec<&str> = survey.users.iter().map(|u| u.name.as_str()).collect();
    assert_eq!(libraries, ["Films", "Shows"]);
    assert_eq!(users, ["sam", "ana", "leo", "kid"]);
}

#[test]
fn a_user_emby_keeps_out_of_a_folder_is_named_with_that_limit() {
    let world = World::over(Recorded::emby());

    let survey = surveyed(&world);

    let leo = survey.users.iter().find(|user| user.id == LEO).unwrap();
    assert_eq!(leo.finer_limits, ["blockedFolders"]);
}

#[test]
fn a_user_emby_shows_only_some_tags_is_named_with_that_limit() {
    let world = World::over(Recorded::emby());

    let survey = surveyed(&world);

    let kid = survey.users.iter().find(|user| user.name == "kid").unwrap();
    assert_eq!(kid.finer_limits, ["tag"]);
}

#[test]
fn a_sign_in_emby_no_longer_accepts_is_said_in_emby_s_name() {
    let world = World::over(Recorded::emby());
    let sign_in = world.signed_in();
    world.jellyfin.revoke();

    let failed = world.importer.survey(&SurveyAsk {
        sign_in,
        server: SERVER.to_string(),
    });

    let said = format!("{:#}", failed.err().unwrap());
    assert_eq!(said, "Emby refused the sign-in it gave. Sign in again.");
}
