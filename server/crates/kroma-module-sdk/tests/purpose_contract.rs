use std::path::Path;
use std::process::Output;

fn test_the_fixture_module() -> Output {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/purpose_fixture/server");
    let target_dir = Path::new(env!("CARGO_TARGET_TMPDIR")).join("purpose_fixture");
    kroma_testing::cargo()
        .args(["test", "--lib"])
        .current_dir(&fixture)
        .env("CARGO_TARGET_DIR", target_dir)
        .output()
        .expect("run cargo")
}

#[test]
fn a_module_test_that_calls_out_for_an_undeclared_purpose_fails_and_names_it() {
    let out = test_the_fixture_module();

    let report = String::from_utf8_lossy(&out.stdout);
    assert!(!out.status.success(), "{report}");
    assert!(
        report.contains("artwork_leaves_for_a_purpose_the_manifest_does_not_declare ... FAILED"),
        "{report}"
    );
    assert!(
        report.contains("details_leave_for_the_declared_purpose ... ok"),
        "{report}"
    );
    assert!(
        report.contains("discover_leaves_for_a_child_of_the_declared_purpose ... ok"),
        "{report}"
    );
    assert!(report.contains("purpose `artwork`"), "{report}");
}
