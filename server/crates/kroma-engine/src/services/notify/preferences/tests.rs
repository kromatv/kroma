use kroma_domain::{
    Audience, CategoryPref, NotificationCategory, NotificationEvent, NotificationSpec, Permission,
    PrefsUpdate, TypeSwitches,
};
use kroma_module_host::HostStorage;

use super::*;
use crate::services::notify::emit;
use crate::services::notify::types::test_support::{declaring_torrents, COMPLETED, MODULE};
use crate::state::SharedState;
use crate::test_support;

fn admin(state: &SharedState) -> String {
    kroma_db::create_user(
        state.db(),
        "ana@t.dev",
        "Ana",
        "h",
        &[Permission::SettingsManage],
    )
    .unwrap()
    .id
}

fn switches(name: &str, in_app: bool, push: bool) -> TypeSwitches {
    TypeSwitches {
        name: name.into(),
        in_app,
        push,
    }
}

fn row<'a>(prefs: &'a NotificationPrefs, name: &str) -> &'a TypePref {
    prefs.types.iter().find(|t| t.name == name).unwrap()
}

fn job_failed() -> NotificationSpec {
    NotificationSpec::new(
        NotificationEvent::SystemJobFailed,
        "notifications.system.job.failed.title",
        "notifications.system.job.failed.body",
    )
    .param_key("job", "jobs.library.scan.name")
}

fn disk_low() -> NotificationSpec {
    NotificationSpec::new(
        NotificationEvent::SystemDiskLow,
        "notifications.system.disk.low.title",
        "notifications.system.disk.low.body",
    )
    .param("free", "2 GB")
    .param("path", "/media")
}

fn save_as(state: &SharedState, user: &str, update: &PrefsUpdate) -> NotificationPrefs {
    save(
        state.db(),
        user,
        update,
        &NotificationTypes::default(),
        |_| true,
        "en",
    )
    .unwrap()
}

#[test]
fn a_reader_who_mutes_failed_jobs_still_hears_that_the_disk_is_low() {
    let state = test_support::test_state();
    let ana = admin(&state);
    let update = PrefsUpdate {
        types: vec![switches("system.job.failed", false, false)],
        ..PrefsUpdate::default()
    };
    save_as(&state, &ana, &update);

    let failed = emit(&state, &Audience::user(ana.clone()), &job_failed());
    let low = emit(&state, &Audience::user(ana), &disk_low());

    assert_eq!(failed, 0);
    assert_eq!(low, 1);
}

#[test]
fn every_kind_is_listed_under_its_category_and_labelled_in_the_readers_language() {
    let state = test_support::test_state();
    let ana = admin(&state);

    let prefs = matrix(
        &state.db().get().unwrap(),
        &ana,
        &declaring_torrents(),
        |_| true,
        "fr",
    )
    .unwrap();

    let job = row(&prefs, "system.job.failed");
    assert_eq!(job.category, NotificationCategory::System);
    assert_eq!(job.label, "Tâche en échec");
    assert!(job.in_app && job.push);
    let completed = row(&prefs, COMPLETED);
    assert_eq!(completed.category, NotificationCategory::Downloads);
    assert!(completed.in_app);
    assert!(!completed.push, "the module declared it quiet on devices");
}

#[test]
fn a_kind_nobody_chose_for_moves_with_its_category() {
    let state = test_support::test_state();
    let ana = admin(&state);
    let update = PrefsUpdate {
        categories: vec![CategoryPref {
            category: NotificationCategory::System,
            in_app: true,
            push: false,
        }],
        ..PrefsUpdate::default()
    };

    let prefs = save_as(&state, &ana, &update);

    assert!(!row(&prefs, "system.disk.low").push);
    assert!(row(&prefs, "system.disk.low").in_app);
}

#[test]
fn a_client_that_sends_categories_alone_leaves_the_readers_types_as_they_were() {
    let state = test_support::test_state();
    let ana = admin(&state);
    save_as(
        &state,
        &ana,
        &PrefsUpdate {
            types: vec![switches("system.job.failed", true, false)],
            ..PrefsUpdate::default()
        },
    );
    let older: PrefsUpdate = serde_json::from_value(serde_json::json!({
        "categories": [{ "category": "media", "inApp": false, "push": false }]
    }))
    .unwrap();

    let prefs = save_as(&state, &ana, &older);

    assert!(!row(&prefs, "system.job.failed").push);
    assert!(!row(&prefs, "media.added").in_app);
}

#[test]
fn a_type_switched_away_from_its_category_keeps_its_own_switch_when_the_category_moves() {
    let state = test_support::test_state();
    let ana = admin(&state);
    save_as(
        &state,
        &ana,
        &PrefsUpdate {
            types: vec![switches("system.job.failed", true, false)],
            ..PrefsUpdate::default()
        },
    );

    let prefs = save_as(
        &state,
        &ana,
        &PrefsUpdate {
            categories: vec![CategoryPref {
                category: NotificationCategory::System,
                in_app: false,
                push: true,
            }],
            ..PrefsUpdate::default()
        },
    );

    let job = row(&prefs, "system.job.failed");
    assert!(
        !job.in_app,
        "the switch it never touched follows the category"
    );
    assert!(!job.push, "the switch it set stays set");
}

#[test]
fn a_type_set_back_to_its_category_follows_the_category_again() {
    let state = test_support::test_state();
    let ana = admin(&state);
    save_as(
        &state,
        &ana,
        &PrefsUpdate {
            types: vec![switches("system.job.failed", true, false)],
            ..PrefsUpdate::default()
        },
    );

    save_as(
        &state,
        &ana,
        &PrefsUpdate {
            types: vec![switches("system.job.failed", true, true)],
            ..PrefsUpdate::default()
        },
    );

    let conn = state.db().get().unwrap();
    assert!(kroma_db::notifications::type_choices(&conn, &ana)
        .unwrap()
        .is_empty());
}

#[test]
fn a_type_nothing_lists_any_more_is_passed_over() {
    let state = test_support::test_state();
    let ana = admin(&state);

    save_as(
        &state,
        &ana,
        &PrefsUpdate {
            types: vec![switches(COMPLETED, false, false)],
            ..PrefsUpdate::default()
        },
    );

    let conn = state.db().get().unwrap();
    assert!(kroma_db::notifications::type_choices(&conn, &ana)
        .unwrap()
        .is_empty());
}

#[test]
fn a_disabled_modules_types_are_left_out_of_the_matrix() {
    let state = test_support::test_state();
    let ana = admin(&state);

    let prefs = matrix(
        &state.db().get().unwrap(),
        &ana,
        &declaring_torrents(),
        |id| id != MODULE,
        "en",
    )
    .unwrap();

    assert!(prefs.types.iter().all(|t| t.name != COMPLETED));
}
