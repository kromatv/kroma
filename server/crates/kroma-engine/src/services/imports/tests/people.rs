use std::sync::atomic::{AtomicBool, Ordering};

use super::super::stages::Core;
use super::super::{Request, StartError, start};
use super::*;
use crate::model::imports::Status;
use crate::model::{AdminUser, InvitationState, LibraryScope};

#[derive(Default)]
struct People {
    others: Recording,
    stops_after_the_users: AtomicBool,
}

impl Stages for People {
    fn libraries(
        &self,
        importing: &Importing<'_>,
        kept: &[LibraryRow<'_>],
    ) -> Result<Vec<Outcome>> {
        self.others.libraries(importing, kept)
    }

    fn users(&self, importing: &Importing<'_>, kept: &UserRows<'_>) -> Result<Vec<Outcome>> {
        let outcomes = Core.users(importing, kept)?;
        if self.stops_after_the_users.swap(false, Ordering::SeqCst) {
            anyhow::bail!("the run stopped before the job recorded the users");
        }
        Ok(outcomes)
    }

    fn titles(&self, importing: &Importing<'_>, page: &TitlePage<'_>) -> Result<Vec<Outcome>> {
        self.others.titles(importing, page)
    }

    fn states(&self, importing: &Importing<'_>, page: &StatePage<'_>) -> Result<Vec<Outcome>> {
        self.others.states(importing, page)
    }

    fn plays(&self, importing: &Importing<'_>, page: &[PlayRow<'_>]) -> Result<Vec<Outcome>> {
        self.others.plays(importing, page)
    }
}

fn waiting(state: &SharedState) -> Vec<AdminUser> {
    let members = db::admin_users(&state.db).unwrap();
    members
        .into_iter()
        .filter(|member| member.invitation.is_some())
        .collect()
}

fn names(state: &SharedState) -> Vec<String> {
    let mut names: Vec<String> = waiting(state).into_iter().map(|m| m.username).collect();
    names.sort_unstable();
    names
}

fn account_named(state: &SharedState, name: &str) -> AdminUser {
    let found = waiting(state).into_iter().find(|m| m.username == name);
    found.unwrap_or_else(|| panic!("no account waits as {name}"))
}

#[test]
fn each_user_the_owner_kept_waits_with_the_sources_their_libraries_became() {
    let state = importing_from(&household());
    let stages = People::default();

    let ran = import(&state, &stages, &everything());

    let ben = account_named(&state, "Ben");
    let cleo = account_named(&state, "Cleo");
    assert_eq!(ran.import.report.users.brought, 2);
    assert_eq!(names(&state), ["Ben", "Cleo"]);
    assert_eq!(ben.libraries, LibraryScope::Only(vec!["source-1".into()]));
    assert_eq!(cleo.libraries, LibraryScope::All);
    assert_eq!(ben.invitation, Some(InvitationState::Absent));
}

#[test]
fn watch_state_and_plays_go_to_the_account_each_user_became() {
    let state = importing_from(&household());
    let stages = People::default();

    import(&state, &stages, &kept(&["1"], &["43"]));

    let ben = account_named(&state, "Ben").id;
    let given = stages.others.given();
    assert_eq!(given.states, vec![format!("t1 for {ben}")]);
    assert_eq!(given.plays, vec![format!("p2 for {ben}")]);
}

#[test]
fn a_user_whose_state_is_locked_comes_over_with_an_account_and_no_watch_state() {
    let server = household();
    let state = importing_from(&server);
    let stages = People::default();

    import(&state, &stages, &kept(&["1"], &["44"]));

    let cleo = account_named(&state, "Cleo").id;
    let given = stages.others.given();
    assert!(server.asked("states").is_empty());
    assert_eq!(given.states, Vec::<String>::new());
    assert_eq!(given.plays, vec![format!("p3 for {cleo}")]);
}

#[test]
fn a_second_import_finds_the_same_accounts_and_adds_none() {
    let state = importing_from(&household());
    let stages = People::default();
    import(&state, &stages, &everything());
    let first: Vec<String> = waiting(&state).into_iter().map(|m| m.id).collect();

    let again = import(&state, &stages, &everything());

    let second: Vec<String> = waiting(&state).into_iter().map(|m| m.id).collect();
    assert_eq!(again.import.status, Status::Completed);
    assert_eq!(again.import.report.users.read, 3);
    assert_eq!(again.import.report.users.brought, 0);
    assert_eq!(second, first);
}

#[test]
fn an_import_that_stopped_after_it_wrote_the_accounts_makes_no_second_one_when_run_again() {
    let state = importing_from(&household());
    let stages = People {
        stops_after_the_users: AtomicBool::new(true),
        ..Default::default()
    };
    let stopped = import(&state, &stages, &kept(&["1"], &["43", "44"]));
    let written: Vec<String> = waiting(&state).into_iter().map(|m| m.id).collect();

    let again = import(&state, &stages, &kept(&["1"], &["43", "44"]));

    let found: Vec<String> = waiting(&state).into_iter().map(|m| m.id).collect();
    assert_eq!(stopped.import.status, Status::Failed);
    assert_eq!(again.import.status, Status::Completed);
    assert_eq!(names(&state), ["Ben", "Cleo"]);
    assert_eq!(found, written);
}

#[test]
fn an_import_that_attaches_a_user_to_an_account_this_server_does_not_have_does_not_start() {
    let state = importing_from(&household());
    let owner = db::create_user(&state.db, "owner@example.test", "owner", "", &[]).unwrap();
    let mut selection = kept(&["1"], &["43"]);
    selection.users[0].account = AccountChoice::Existing("nobody".into());
    let request = Request {
        importer: IMPORTER.into(),
        sign_in: "s-1".into(),
        server: living_room(),
        selection,
        started_by: owner.id,
    };

    let refused = start(&state, request);

    assert!(matches!(refused, Err(StartError::Invalid(_))));
    assert!(db::imports::list(&state.db, 10).unwrap().is_empty());
}
