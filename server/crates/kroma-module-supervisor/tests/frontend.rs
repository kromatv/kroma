mod install_support;

use install_support::{current, supervisor, tar_with_files, temp_modules_dir, uploaded};

const ID: &str = "com.example.demo";

fn manifest() -> String {
    current(r#""id": "com.example.demo", "name": "Demo", "version": "1.0.0", "library": true"#)
}

fn bundle(files: &[(&str, &str)]) -> Vec<u8> {
    let manifest = manifest();
    let mut all = vec![("module.json", manifest.as_str())];
    all.extend_from_slice(files);
    tar_with_files(&all)
}

#[test]
fn a_bundle_without_an_entry_has_no_frontend() {
    let scratch = temp_modules_dir("fe-none");
    let sup = supervisor(scratch.path(), "0.1.4");

    sup.install(
        &bundle(&[("fe/assets/Page-BKMFTghM.js", "1")]),
        None,
        uploaded(),
    )
    .unwrap();

    assert_eq!(sup.frontend(ID), None);
    assert_eq!(sup.frontend("com.example.absent"), None);
    assert_eq!(sup.frontend("../escape"), None);
}

#[test]
fn a_frontend_carries_what_its_build_declared_it_reads() {
    let scratch = temp_modules_dir("fe-shared");
    let sup = supervisor(scratch.path(), "0.1.4");

    sup.install(
        &bundle(&[
            ("fe/remoteEntry.js", "export default 1;"),
            (
                "fe/shared.json",
                r#"{ "@kromatv/module-sdk": ["defineModule"] }"#,
            ),
        ]),
        None,
        uploaded(),
    )
    .unwrap();

    let frontend = sup.frontend(ID).unwrap();
    assert_eq!(frontend.revision.len(), 16);
    assert!(frontend.revision.bytes().all(|b| b.is_ascii_hexdigit()));
    assert_eq!(
        serde_json::to_value(&frontend.shared).unwrap(),
        serde_json::json!({ "@kromatv/module-sdk": ["defineModule"] })
    );
}

#[test]
fn a_declaration_that_is_not_one_is_left_out_rather_than_guessed() {
    let scratch = temp_modules_dir("fe-bad-shared");
    let sup = supervisor(scratch.path(), "0.1.4");

    sup.install(
        &bundle(&[
            ("fe/remoteEntry.js", "export default 1;"),
            ("fe/shared.json", r#"{ "react": "everything" }"#),
        ]),
        None,
        uploaded(),
    )
    .unwrap();

    assert_eq!(sup.frontend(ID).unwrap().shared, None);
}

#[test]
fn the_revision_moves_with_any_file_and_holds_while_none_does() {
    let scratch = temp_modules_dir("fe-revision");
    let sup = supervisor(scratch.path(), "0.1.4");
    let first = bundle(&[
        ("fe/remoteEntry.js", "export default 1;"),
        ("fe/assets/Page-BKMFTghM.js", "page one"),
    ]);
    let chunk_changed = bundle(&[
        ("fe/remoteEntry.js", "export default 1;"),
        ("fe/assets/Page-BKMFTghM.js", "page two"),
    ]);

    sup.install(&first, None, uploaded()).unwrap();
    let installed = sup.frontend(ID).unwrap().revision;
    sup.install(&first, None, uploaded()).unwrap();
    let reinstalled = sup.frontend(ID).unwrap().revision;
    sup.install(&chunk_changed, None, uploaded()).unwrap();
    let updated = sup.frontend(ID).unwrap().revision;

    assert_eq!(installed, reinstalled);
    assert_ne!(installed, updated);
}

#[test]
fn an_uninstalled_module_has_no_frontend_left() {
    let scratch = temp_modules_dir("fe-uninstall");
    let sup = supervisor(scratch.path(), "0.1.4");
    sup.install(&bundle(&[("fe/remoteEntry.js", "1")]), None, uploaded())
        .unwrap();
    assert!(sup.frontend(ID).is_some());

    sup.uninstall(ID).unwrap();

    assert_eq!(sup.frontend(ID), None);
}
