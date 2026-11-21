use super::super::stages::Core;
use super::this_machine::{at, became, films_at, libraries, source_ids, this_machine};
use super::*;
use crate::model::imports::RefusedLibrary;
use crate::services::settings::{self, LibraryDef};

fn a_source(state: &SharedState, name: &str, folder: &str) -> String {
    let def = LibraryDef {
        id: format!("source-{name}"),
        name: name.into(),
        kind: "movies".into(),
        folders: vec![folder.into()],
        auto_scan: true,
    };
    settings::set_library_defs(&state.settings, &state.db, std::slice::from_ref(&def));
    def.id
}

#[tokio::test]
async fn a_library_over_a_folder_that_holds_a_source_is_not_made_and_the_report_says_why() {
    let disk = this_machine(&["films/4k"]);
    let state = importing_from(&household());
    let four_k = a_source(&state, "Films 4K", &at(&disk, "films/4k"));

    let ran = import(&state, &Core, &films_at(&at(&disk, "films")));

    assert_eq!(source_ids(&state), vec![four_k]);
    assert_eq!(
        ran.import.report.refused_libraries,
        vec![RefusedLibrary {
            name: "Films".into(),
            shares_files_with: "Films 4K".into(),
        }]
    );
    assert_eq!(ran.import.report.libraries, libraries(1, 0));
    assert!(became(&state).is_empty());
}

#[tokio::test]
async fn a_refused_library_is_made_by_a_later_import_once_nothing_holds_its_files() {
    let disk = this_machine(&["films/4k"]);
    let state = importing_from(&household());
    a_source(&state, "Films 4K", &at(&disk, "films/4k"));
    import(&state, &Core, &films_at(&at(&disk, "films")));
    settings::set_library_defs(&state.settings, &state.db, &[]);

    let again = import(&state, &Core, &films_at(&at(&disk, "films")));

    assert_eq!(source_ids(&state).len(), 1);
    assert_eq!(again.import.report.libraries, libraries(1, 1));
    assert!(again.import.report.refused_libraries.is_empty());
}

#[tokio::test]
async fn a_library_beside_a_source_whose_name_starts_the_same_is_made() {
    let disk = this_machine(&["films", "films 4k"]);
    let state = importing_from(&household());
    a_source(&state, "Films 4K", &at(&disk, "films 4k"));

    let ran = import(&state, &Core, &films_at(&at(&disk, "films")));

    assert_eq!(source_ids(&state).len(), 2);
    assert!(ran.import.report.refused_libraries.is_empty());
}
