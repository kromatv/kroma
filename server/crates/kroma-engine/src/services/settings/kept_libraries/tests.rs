use serde_json::json;

use super::*;
use crate::state::SharedState;
use crate::test_support::{seed_library, test_state};

fn owners() -> HeldLibrary {
    HeldLibrary {
        id: "lib-owner".into(),
        name: "Lib lib-owner".into(),
    }
}

fn holding_the_owners_library() -> SharedState {
    let state = test_state();
    seed_library(&state, "lib-owner", "movies");
    state
}

fn left_out() -> Option<Refusal> {
    Some(Refusal::LeavesOut(vec![owners()]))
}

#[test]
fn the_demo_libraries_are_not_the_owners_to_keep() {
    let state = holding_the_owners_library();
    for demo in crate::services::demo::demo_data().libraries {
        seed_library(&state, &demo.id, "movies");
    }
    let written_demo = crate::services::scan::short_hash("lib|demo|movies");
    seed_library(&state, &written_demo, "movies");

    let held = held_libraries(&state.db).unwrap();

    assert_eq!(held, [owners()]);
}

#[test]
fn a_list_that_names_every_held_library_may_be_saved() {
    let state = holding_the_owners_library();
    let list = json!([
        { "id": "lib-owner", "name": "Films", "folders": ["/a"] },
        { "id": "lib-new", "name": "Shows", "folders": ["/b"] },
    ]);

    let refused = refusal(&state.db, &list).unwrap();

    assert_eq!(refused, None);
}

#[test]
fn null_and_the_empty_list_may_be_saved_only_while_the_index_holds_no_library() {
    let state = test_state();
    let empty = json!([]);
    let before = [
        refusal(&state.db, &Value::Null).unwrap(),
        refusal(&state.db, &empty).unwrap(),
    ];
    seed_library(&state, "lib-owner", "movies");

    let after = [
        refusal(&state.db, &Value::Null).unwrap(),
        refusal(&state.db, &empty).unwrap(),
    ];

    assert_eq!(before, [None, None]);
    assert_eq!(after, [left_out(), left_out()]);
}

#[test]
fn the_same_folder_under_a_new_id_leaves_the_held_library_out() {
    let state = holding_the_owners_library();
    let renamed = json!([{ "id": "lib-saved-again", "name": "Films", "folders": ["/a"] }]);

    let refused = refusal(&state.db, &renamed).unwrap();

    assert_eq!(refused, left_out());
}

#[test]
fn a_value_that_is_not_a_list_is_refused_as_such() {
    let state = holding_the_owners_library();

    let refused = refusal(&state.db, &json!([{ "name": "Films" }])).unwrap();

    assert_eq!(refused, Some(Refusal::NotAList));
    assert_eq!(Refusal::NotAList.notice().key, "error.librariesNotAList");
}

#[test]
fn an_index_that_does_not_read_lets_no_list_through() {
    let state = holding_the_owners_library();
    state
        .db
        .get()
        .unwrap()
        .execute_batch("ALTER TABLE libraries RENAME TO libraries_away")
        .unwrap();

    let refused = refusal(&state.db, &json!([]));

    assert!(refused.is_err());
    assert_eq!(
        unreadable_list_notice(&state.db).key,
        "error.libraryListUnreadable"
    );
}

#[test]
fn a_refusal_names_each_library_left_out_by_its_name_and_its_id() {
    let shows = HeldLibrary {
        id: "lib-2".into(),
        name: "Séries".into(),
    };

    let notice = Refusal::LeavesOut(vec![owners(), shows]).notice();

    let named = "Lib lib-owner (lib-owner), Séries (lib-2)";
    assert_eq!(notice.key, "error.librariesLeftOut");
    assert_eq!(notice.libraries, named);
    assert!(notice.said_in("en").contains(named));
    assert!(notice.said_in("fr").contains(named));
    assert!(notice.said_in("fr").starts_with("Impossible"));
}

#[test]
fn a_list_that_cannot_be_read_names_the_libraries_to_keep() {
    let state = holding_the_owners_library();

    let notice = unreadable_list_notice(&state.db);
    let failure = unreadable_list_failure(&state.db).to_string();

    assert_eq!(notice.key, "error.libraryListUnreadableKeep");
    assert_eq!(notice.libraries, "Lib lib-owner (lib-owner)");
    assert_eq!(failure, notice.said_in("en"));
    assert!(failure.contains("Lib lib-owner (lib-owner)"), "{failure}");
}

#[test]
fn a_list_that_cannot_be_read_beside_no_library_names_none() {
    let state = test_state();

    let notice = unreadable_list_notice(&state.db);

    assert_eq!(notice.key, "error.libraryListUnreadable");
    assert_eq!(notice.libraries, "");
    assert!(!notice.said_in("fr").contains('{'));
}

#[test]
fn the_library_writer_alone_may_leave_a_held_library_out() {
    let state = holding_the_owners_library();

    crate::services::settings::set_library_defs(&state.settings, &state.db, &[]);

    assert_eq!(state.settings.stored("libraries"), Some(json!([])));
}
