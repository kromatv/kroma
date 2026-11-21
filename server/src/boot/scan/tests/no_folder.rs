use super::*;

fn without_folders(
    defs: Vec<services::settings::LibraryDef>,
) -> Vec<services::settings::LibraryDef> {
    defs.into_iter()
        .map(|def| services::settings::LibraryDef {
            folders: Vec::new(),
            ..def
        })
        .collect()
}

fn resume_the_only_title(pool: &db::Pool) -> (String, String) {
    let user = db::create_user(pool, "viewer@example.test", "viewer", "x", &[]).unwrap();
    let item = db::list_items(pool, None).unwrap().remove(0);
    db::upsert_progress(pool, &user.id, &item.id, 600_000, Some(7_200_000)).unwrap();
    (user.id, item.id)
}

#[test]
fn a_library_whose_folders_were_removed_keeps_its_titles_and_their_positions_at_startup() {
    let pool = kroma_db::testing::temp_pool("boot-scan");
    let root = one_film("no-folder");
    walked_at_startup(&pool, &library(root.path()));
    let (user, item) = resume_the_only_title(&pool);

    walked_at_startup(&pool, &without_folders(library(root.path())));

    let libraries = db::list_libraries(&pool).unwrap();
    assert_eq!(
        libraries.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(),
        ["lib-1"]
    );
    assert!(db::get_item(&pool, &item).unwrap().is_some());
    let kept = db::get_progress(&pool, &user, &item).unwrap();
    assert_eq!(kept.map(|p| p.position_ms), Some(600_000));
}

#[test]
fn a_server_whose_only_library_has_no_folder_is_not_seeded_with_the_demo() {
    let pool = kroma_db::testing::temp_pool("boot-scan");
    let root = kroma_testing::temp_dir("boot-scan-no-folder-fresh");

    let scanned = walked_at_startup(&pool, &without_folders(library(root.path())));

    assert!(matches!(
        scanned,
        services::scan::Scanned::MountOffline { dropped: 0 }
    ));
    assert_eq!(stored_items(&pool), 0);
}
