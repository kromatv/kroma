mod choosing;
mod described;
mod found_again;
mod invitations;

use serde_json::{Value, json};

use super::*;
use crate::db::imports::{Entry, Ledger, NewImport};
use crate::model::imports::{Import, KeptUser, Kind, Origin, Selection};
use crate::model::{AdminUser, InvitationState, LibraryScope, Permission};
use crate::state::SharedState;
use crate::test_support::test_state;

const IMPORTER: &str = "tv.x.import";

struct Household {
    state: SharedState,
    import: Import,
    server_id: String,
    owner: String,
    sources: HashMap<String, String>,
}

fn queued(state: &SharedState, started_by: Option<&str>) -> Import {
    let server = Origin {
        id: "srv".into(),
        name: "Living room".into(),
    };
    let new = NewImport {
        id: "i1",
        importer: IMPORTER,
        server: &server,
        sign_in: "s-1",
        selection: &Selection::default(),
        started_by,
        created_ms: 1,
    };
    assert!(db::imports::queue(&state.db, &new).unwrap());
    db::imports::get(&state.db, "i1").unwrap().unwrap()
}

fn owner_of(state: &SharedState) -> String {
    let owner = [Permission::UsersManage, Permission::SettingsManage];
    db::create_user(&state.db, "ana@example.test", "Ana", "", &owner)
        .unwrap()
        .id
}

fn settled_in(state: SharedState, owner: String, import: Import) -> Household {
    Household {
        import,
        server_id: db::imports::server_key(IMPORTER, "srv"),
        owner,
        sources: [("1", "films"), ("2", "shows"), ("3", "films")]
            .map(|(library, source)| (library.to_string(), source.to_string()))
            .into(),
        state,
    }
}

fn household() -> Household {
    let state = test_state();
    let owner = owner_of(&state);
    let import = queued(&state, Some(&owner));
    settled_in(state, owner, import)
}

fn a_household_nobody_here_started() -> Household {
    let state = test_state();
    let owner = owner_of(&state);
    let import = queued(&state, None);
    settled_in(state, owner, import)
}

fn user(described: Value) -> User {
    serde_json::from_value(described).unwrap()
}

fn ben() -> User {
    user(json!({ "id": "43", "name": "Ben", "email": "ben@example.test", "libraries": ["1"] }))
}

fn account_of(outcome: &Outcome) -> String {
    match outcome {
        Outcome::Brought { target: Some(id) } => id.clone(),
        other => panic!("the user should have an account, got {other:?}"),
    }
}

impl Household {
    fn users_ledger(&self) -> Ledger<'_> {
        Ledger {
            server_id: &self.server_id,
            kind: Kind::User,
            scope: "",
        }
    }

    fn offer(&self, kept: &[(&User, AccountChoice)]) -> Vec<Outcome> {
        let known = db::imports::targets(&self.state.db, &self.server_id, Kind::User).unwrap();
        let answers: Vec<KeptUser> = kept
            .iter()
            .map(|(user, account)| KeptUser {
                id: user.id.clone(),
                account: account.clone(),
            })
            .collect();
        let rows: Vec<UserRow<'_>> = kept
            .iter()
            .zip(&answers)
            .map(|((user, _), kept)| UserRow {
                user,
                kept,
                account: known.get(&user.id).map(String::as_str),
            })
            .collect();
        let importing = Importing {
            state: &self.state,
            import: &self.import,
            server_id: &self.server_id,
        };
        let users = UserRows {
            rows: &rows,
            sources: &self.sources,
        };
        settle(&importing, &users).unwrap()
    }

    fn import(&self, kept: &[(&User, AccountChoice)]) -> Vec<Outcome> {
        let outcomes = self.offer(kept);
        for ((user, _), outcome) in kept.iter().zip(&outcomes) {
            let Outcome::Brought { target } = outcome else {
                continue;
            };
            let entry = Entry {
                id: &user.id,
                fingerprint: "f",
                target: target.as_deref(),
            };
            db::imports::record(&self.state.db, &self.users_ledger(), "i1", &[entry]).unwrap();
        }
        outcomes
    }

    fn bring(&self, user: &User) -> Outcome {
        self.import(&[(user, AccountChoice::Proposed)]).remove(0)
    }

    fn members(&self) -> Vec<AdminUser> {
        db::admin_users(&self.state.db).unwrap()
    }

    fn member(&self, id: &str) -> AdminUser {
        let found = self.members().into_iter().find(|member| member.id == id);
        found.unwrap_or_else(|| panic!("no account {id}"))
    }

    fn libraries_of(&self, described: Value) -> LibraryScope {
        let account = account_of(&self.bring(&user(described)));
        self.member(&account).libraries
    }
}
