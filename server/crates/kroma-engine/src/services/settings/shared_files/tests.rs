use super::*;

fn library(id: &str, folders: &[&str]) -> LibraryDef {
    LibraryDef {
        id: id.into(),
        name: id.into(),
        kind: "movies".into(),
        folders: folders.iter().map(ToString::to_string).collect(),
        auto_scan: true,
    }
}

fn folders(list: &[&str]) -> Vec<String> {
    list.iter().map(ToString::to_string).collect()
}

#[test]
fn a_folder_holds_itself_and_every_folder_below_it() {
    assert!(holds("/media/Films", "/media/Films"));
    assert!(holds("/media/Films", "/media/Films/4K"));
    assert!(!holds("/media/Films/4K", "/media/Films"));
}

#[test]
fn a_folder_does_not_hold_a_sibling_whose_name_starts_the_same() {
    assert!(!holds("/media/Films", "/media/Films 4K"));
    assert!(!holds("/media/Films", "/media/Films4K/Heat"));
}

#[test]
fn folders_are_compared_once_their_spelling_is_resolved() {
    assert!(holds("/media/Films/", "/media/Films/4K"));
    assert!(holds("/media/./Films", "/media/Films/4K"));
    assert!(holds("/media/Series/../Films", "/media/Films/4K"));
    assert!(holds(" /media/Films ", "/media/Films/4K"));
}

#[test]
fn a_new_library_below_a_folder_of_another_shares_its_files() {
    let defs = [library("films", &["/media/Films"])];

    let shared = library_sharing_files(&defs, &folders(&["/media/Films/4K"]), None);

    assert_eq!(shared.map(|def| def.id.as_str()), Some("films"));
}

#[test]
fn a_new_library_above_a_folder_of_another_shares_its_files() {
    let defs = [
        library("series", &["/media/Series"]),
        library("films-4k", &["/srv/a", "/media/Films/4K"]),
    ];

    let shared = library_sharing_files(&defs, &folders(&["/media/Films"]), None);

    assert_eq!(shared.map(|def| def.id.as_str()), Some("films-4k"));
}

#[test]
fn libraries_over_folders_apart_share_nothing() {
    let defs = [library("films", &["/media/Films"])];

    let shared = library_sharing_files(&defs, &folders(&["/media/Films 4K", "/media/Series"]), None);

    assert!(shared.is_none());
}

#[test]
fn a_library_being_edited_does_not_share_files_with_itself() {
    let defs = [library("films", &["/media/Films"])];

    let shared = library_sharing_files(&defs, &folders(&["/media/Films/4K"]), Some("films"));

    assert!(shared.is_none());
}
