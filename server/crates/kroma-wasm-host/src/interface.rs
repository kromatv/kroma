//! Which versions of the host interface a component's own bytes import.

use std::collections::BTreeSet;

use wasmparser::{Parser, Payload};

use crate::HostError;

const PACKAGE: &str = "kroma:module/";

/// The versions of `kroma:module` the component in `wasm` imports, read from
/// its bytes without compiling it. Empty for a component that imports none of
/// it. The bytes are the truth about what a component was built against, where
/// a manifest is only what its author wrote.
pub fn imported_interfaces(wasm: &[u8]) -> Result<BTreeSet<String>, HostError> {
    let mut versions = BTreeSet::new();
    let mut nested = 0usize;
    for payload in Parser::new(0).parse_all(wasm) {
        match payload.map_err(HostError::Unreadable)? {
            Payload::ModuleSection { .. } | Payload::ComponentSection { .. } => nested += 1,
            Payload::End(_) => nested = nested.saturating_sub(1),
            Payload::ComponentImportSection(imports) if nested == 0 => {
                for import in imports {
                    let name = import.map_err(HostError::Unreadable)?.name;
                    let named = name.full_implements().unwrap_or_else(|| name.full_name());
                    if let Some((_, version)) = named
                        .strip_prefix(PACKAGE)
                        .and_then(|interface| interface.split_once('@'))
                    {
                        versions.insert(version.to_owned());
                    }
                }
            }
            _ => {}
        }
    }
    Ok(versions)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn section(id: u8, body: &[u8]) -> Vec<u8> {
        let mut out = vec![id, u8::try_from(body.len()).unwrap()];
        out.extend_from_slice(body);
        out
    }

    fn importing(names: &[&str]) -> Vec<u8> {
        let mut wasm = b"\0asm\x0d\0\x01\0".to_vec();
        wasm.extend(section(7, &[1, 0x42, 0]));
        let mut imports = vec![u8::try_from(names.len()).unwrap()];
        for name in names {
            imports.push(0);
            imports.push(u8::try_from(name.len()).unwrap());
            imports.extend_from_slice(name.as_bytes());
            imports.extend_from_slice(&[0x05, 0]);
        }
        wasm.extend(section(10, &imports));
        wasm
    }

    #[test]
    fn reads_the_interface_version_out_of_the_imports() {
        let wasm = importing(&["kroma:module/net@0.2.0", "kroma:module/sql@0.2.0"]);

        let versions = imported_interfaces(&wasm).unwrap();

        assert_eq!(versions, BTreeSet::from(["0.2.0".to_owned()]));
    }

    #[test]
    fn names_every_version_a_component_imports() {
        let wasm = importing(&["kroma:module/net@0.2.0", "kroma:module/sql@0.3.1"]);

        let versions = imported_interfaces(&wasm).unwrap();

        assert_eq!(
            versions,
            BTreeSet::from(["0.2.0".to_owned(), "0.3.1".to_owned()])
        );
    }

    #[test]
    fn an_import_from_another_package_is_not_the_host_interface() {
        let wasm = importing(&["wasi:io/streams@0.2.6", "kroma:modules/net@9.0.0"]);

        assert!(imported_interfaces(&wasm).unwrap().is_empty());
    }

    #[test]
    fn bytes_that_are_not_a_component_are_unreadable() {
        let refusal = imported_interfaces(b"not a component").unwrap_err();

        assert!(matches!(refusal, HostError::Unreadable(_)));
    }
}
