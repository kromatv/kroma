mod install_support;

use install_support::{current, supervisor, tar_with_manifest, temp_modules_dir, uploaded};
use kroma_module_supervisor::{Accept, Source, INSTALLED_DIR};

#[test]
fn upgrading_a_module_keeps_the_database_it_owns() {
    let scratch = temp_modules_dir("keep-store");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    let bundle = |version: &str| {
        tar_with_manifest(&current(&format!(
            r#""id": "com.example.demo", "name": "Demo", "version": "{version}",
                 "storage": {{}}, "library": true"#
        )))
    };

    sup.install(&bundle("1.0.0"), None, uploaded()).unwrap();
    let store = dir.join("com.example.demo").join("module.sqlite");
    std::fs::create_dir_all(store.parent().unwrap()).unwrap();
    std::fs::write(&store, b"the module's own rows").unwrap();
    sup.install(&bundle("2.0.0"), None, uploaded()).unwrap();

    assert_eq!(std::fs::read(&store).unwrap(), b"the module's own rows");
    assert_eq!(sup.installed_manifests()[0].version, "2.0.0");
}

#[test]
fn a_module_remembers_whether_the_official_catalog_served_it() {
    let scratch = temp_modules_dir("origin-official");
    let dir = scratch.path();
    let sup = supervisor(dir, "9.9.9");
    let bundle = tar_with_manifest(&current(
        r#""id": "com.example.demo", "name": "Demo", "version": "1.0.0", "library": true"#,
    ));

    sup.install(
        &bundle,
        Some("com.example.demo"),
        Source {
            kind: "registry",
            url: Some("https://github.com/owner/repo/releases/download/x/demo.kmod"),
            official: true,
            accept: Accept::Anything,
        },
    )
    .unwrap();

    assert!(
        sup.origin("com.example.demo").official,
        "an artifact URL names a release host, not the catalog that listed it"
    );

    sup.install(&bundle, Some("com.example.demo"), uploaded())
        .unwrap();
    assert!(!sup.origin("com.example.demo").official);
}

fn tar_with_frontend(manifest: &str, entry: &str) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    for (path, body) in [("module.json", manifest), ("fe/remoteEntry.js", entry)] {
        let mut header = tar::Header::new_gnu();
        header.set_size(body.len() as u64);
        header.set_mode(0o600);
        header.set_mtime(0);
        header.set_cksum();
        builder
            .append_data(&mut header, path, body.as_bytes())
            .unwrap();
    }
    builder.into_inner().unwrap()
}

#[test]
fn an_installed_frontend_is_dated_by_the_install_rather_than_by_the_bundle() {
    let scratch = temp_modules_dir("fe-date");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    let bundle = tar_with_frontend(
        &current(
            r#""id": "com.example.demo", "name": "Demo", "version": "1.0.0", "library": true"#,
        ),
        "export {};",
    );
    let started = std::time::SystemTime::now() - std::time::Duration::from_secs(60);

    sup.install(&bundle, None, uploaded()).unwrap();

    let entry = dir
        .join(INSTALLED_DIR)
        .join("com.example.demo")
        .join("fe")
        .join("remoteEntry.js");
    assert!(std::fs::metadata(entry).unwrap().modified().unwrap() > started);
}
