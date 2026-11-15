mod support;

use std::collections::BTreeSet;

use kroma_wasm_host::imported_interfaces;
use support::guest_wasm;

const WIT: &str = include_str!("../../kroma-module-runtime/wit/module.wit");

#[test]
fn a_guest_built_here_imports_the_one_version_its_wit_package_names() {
    let version = WIT
        .lines()
        .next()
        .and_then(|package| package.strip_prefix("package kroma:module@"))
        .and_then(|rest| rest.strip_suffix(';'))
        .unwrap();

    let imported = imported_interfaces(guest_wasm()).unwrap();

    assert_eq!(imported, BTreeSet::from([version.to_owned()]));
}
