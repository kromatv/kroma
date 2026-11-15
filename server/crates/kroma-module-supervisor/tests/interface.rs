//! Integration tests for the host interface gate at install: a component is
//! judged by the interface version its own bytes import.

use kroma_module_manifest::HOST_INTERFACE;

mod install_support;

use install_support::{
    component_importing, current, supervisor, tar_with_component, temp_modules_dir, uploaded,
};

const ID: &str = "com.example.built";

fn manifest(engines: &str) -> String {
    current(&format!(
        r#""id": "{ID}", "name": "Built", "version": "1.0.0", "engines": {engines}"#
    ))
}

fn refusal(built: &str) -> String {
    format!("'{ID}' was built against module interface {built} (this server implements {HOST_INTERFACE})")
}

#[test]
fn a_component_built_against_another_interface_is_refused_by_name_and_nothing_is_installed() {
    let scratch = temp_modules_dir("interface-other");
    let sup = supervisor(scratch.path(), "0.1.4");
    let bundle = tar_with_component(
        &manifest(r#"{ "server": ">=0.1.0" }"#),
        &component_importing("kroma:module/net@9.0.0"),
    );

    let installed = sup.install(&bundle, None, uploaded());
    let inspected = sup.inspect(&bundle);

    assert_eq!(installed.unwrap_err().to_string(), refusal("9.0.0"));
    assert_eq!(inspected.unwrap_err().to_string(), refusal("9.0.0"));
    assert!(sup.installed_ids().is_empty());
}

#[test]
fn the_components_own_imports_decide_whatever_its_manifest_says() {
    let scratch = temp_modules_dir("interface-hand-edited");
    let sup = supervisor(scratch.path(), "0.1.4");
    let bundle = tar_with_component(
        &manifest(&format!(r#"{{ "host": "{HOST_INTERFACE}" }}"#)),
        &component_importing("kroma:module/net@9.0.0"),
    );

    let installed = sup.install(&bundle, None, uploaded());

    assert_eq!(installed.unwrap_err().to_string(), refusal("9.0.0"));
}

#[test]
fn a_manifest_that_names_another_interface_is_refused_before_its_component_is_read() {
    let scratch = temp_modules_dir("interface-manifest");
    let sup = supervisor(scratch.path(), "0.1.4");
    let bundle = tar_with_component(&manifest(r#"{ "host": "9.0.0" }"#), b"not a component");

    let installed = sup.install(&bundle, None, uploaded());

    assert_eq!(installed.unwrap_err().to_string(), refusal("9.0.0"));
}
