use super::DeclaredPurposes;

/// What every test binary of a module runs before `main`, linked by the
/// `embedded_module!` that builds its `MODULE`.
pub fn hold_this_test_binary_to_its_module() {
    if let Some(declared) = DeclaredPurposes::beside_this_crate() {
        let _ = declared.hold_this_process();
    }
    #[cfg(target_family = "wasm")]
    kroma_module_runtime::guest::connect_to_host();
}

#[ctor::ctor(unsafe)]
fn on_start() {
    hold_this_test_binary_to_its_module();
}
