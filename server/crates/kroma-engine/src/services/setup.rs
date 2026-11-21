//! The guided setup an owner is led through, as the server keeps it: where the
//! owner stopped, and which steps are done wherever they were done (ADMIN-122).

use anyhow::Result;

use crate::db;
use crate::domain::imports::Status;
use crate::domain::setup::{Facts, Setup, SetupView};
use crate::services::settings;
use crate::state::SharedState;

const IMPORTS_READ: usize = 50;

fn imported(state: &SharedState) -> Result<bool> {
    let imports = db::imports::list(&state.db, IMPORTS_READ)?;
    Ok(imports
        .iter()
        .any(|import| import.status == Status::Completed))
}

fn has_source(state: &SharedState) -> bool {
    let Ok(defs) = settings::library_defs(&state.settings, &state.config) else {
        return true;
    };
    defs.iter().any(|def| {
        !settings::is_demo_library(&def.id) && !crate::services::demo::is_demo_library(&def.id)
    })
}

fn has_people(state: &SharedState) -> Result<bool> {
    Ok(db::user_count(&state.db)? > 1 || !db::list_invites(&state.db)?.is_empty())
}

/// What the server holds that makes a step done. Whether a module is
/// installed is the caller's to say: the engine does not see the supervisor.
pub fn facts(state: &SharedState, module: bool) -> Result<Facts> {
    Ok(Facts {
        imported: imported(state)?,
        source: has_source(state),
        module,
        people: has_people(state)?,
    })
}

/// The setup `user` leads after `change`, with every step the server now holds
/// done recorded. `change` says whether it changed anything. `None` when the
/// setup leads someone else, or when the server has no setup.
pub fn answer(
    state: &SharedState,
    user: &str,
    module: bool,
    change: impl FnOnce(&mut Setup) -> bool,
) -> Result<Option<SetupView>> {
    let Some(mut setup) = db::setup::setup(&state.db)?.filter(|kept| kept.is_led_by(user)) else {
        return Ok(None);
    };
    let changed = change(&mut setup);
    let observed = setup.observe(facts(state, module)?);
    if changed || observed {
        db::setup::save_setup(&state.db, &setup)?;
    }
    Ok(Some(setup.view()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::setup::Step;
    use crate::test_support::test_state;

    fn led(state: &SharedState) -> String {
        let owner = db::create_user(&state.db, "owner@test.dev", "owner", "hash", &[]).unwrap();
        db::setup::lead_setup(&state.db, &owner.id).unwrap();
        owner.id
    }

    #[test]
    fn a_server_with_only_the_demo_libraries_has_no_source() {
        let state = test_state();

        let held = facts(&state, false).unwrap();

        assert!(!held.source);
    }

    #[test]
    fn the_module_fact_is_the_callers() {
        let state = test_state();

        let held = facts(&state, true).unwrap();

        assert!(held.module);
    }

    #[test]
    fn a_change_is_kept() {
        let state = test_state();
        let owner = led(&state);

        answer(&state, &owner, false, |setup| {
            setup.ended = true;
            true
        })
        .unwrap();

        assert!(db::setup::setup(&state.db).unwrap().unwrap().ended);
    }

    #[test]
    fn a_step_the_server_holds_done_is_kept_done_by_a_read() {
        let state = test_state();
        let owner = led(&state);

        answer(&state, &owner, true, |_| false).unwrap();

        let kept = db::setup::setup(&state.db).unwrap().unwrap();
        assert!(kept.done.contains(&Step::Modules));
    }

    #[test]
    fn someone_the_setup_does_not_lead_reads_none() {
        let state = test_state();
        led(&state);

        let view = answer(&state, "someone-else", false, |_| false).unwrap();

        assert_eq!(view, None);
    }
}
