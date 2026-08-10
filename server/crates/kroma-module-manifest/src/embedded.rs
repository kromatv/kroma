//! A ready-made [`Module`] backed by a module's embedded `module.json` + icon.
//!
//! `include_str!`/`include_bytes!` stay at the module crate so their paths
//! resolve there — a cross-crate `macro_rules!` would resolve them against
//! this crate instead.

use crate::{Module, ModuleIcon, ModuleManifest};

#[derive(Clone, Copy)]
struct EmbeddedIcon {
    content_type: &'static str,
    bytes: &'static [u8],
}

/// A module whose manifest and icon are embedded at compile time.
#[derive(Clone, Copy)]
pub struct EmbeddedModule {
    manifest_json: &'static str,
    icon: Option<EmbeddedIcon>,
}

impl EmbeddedModule {
    /// A module with an embedded SVG icon (the common case).
    pub const fn new(manifest_json: &'static str, icon_svg: &'static [u8]) -> Self {
        Self {
            manifest_json,
            icon: Some(EmbeddedIcon { content_type: "image/svg+xml", bytes: icon_svg }),
        }
    }

    /// A module with an embedded PNG icon.
    pub const fn with_png(manifest_json: &'static str, icon_png: &'static [u8]) -> Self {
        Self {
            manifest_json,
            icon: Some(EmbeddedIcon { content_type: "image/png", bytes: icon_png }),
        }
    }

    /// A module with an embedded icon of an explicit content type. Used by the
    /// `embedded_module!()` macro, which discovers the icon file at compile time
    /// and passes the MIME derived from its extension.
    pub const fn with_icon(
        manifest_json: &'static str,
        icon_bytes: &'static [u8],
        content_type: &'static str,
    ) -> Self {
        Self { manifest_json, icon: Some(EmbeddedIcon { content_type, bytes: icon_bytes }) }
    }

    /// A module with no packaged icon.
    pub const fn iconless(manifest_json: &'static str) -> Self {
        Self { manifest_json, icon: None }
    }
}

impl Module for EmbeddedModule {
    fn manifest(&self) -> ModuleManifest {
        serde_json::from_str(self.manifest_json).expect("valid embedded module.json")
    }

    // No `register` override: the default no-op keeps the manifest's declared
    // `provides` verbatim (with their `label` / `fields` / `flow` UI metadata).
    // Re-providing them here would flatten each back to a bare `(kind, id)`, since
    // `ModuleRegistration::provide` only records those two (see `Registry::register`).

    fn icon(&self) -> Option<ModuleIcon> {
        self.icon.map(|i| ModuleIcon { content_type: i.content_type, bytes: i.bytes })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Registry;

    // Regression guard: the old `register()` override flattened every
    // capability back to a bare `(kind, id)`, losing the UI metadata that
    // `/api/modules` needs to drive the admin's add-pickers.
    #[test]
    fn embedded_provides_keep_ui_metadata() {
        const MANIFEST: &str = r#"{
            "id": "tv.kroma.engine.example",
            "name": "Example engine",
            "version": "0.1.0",
            "provides": [{
                "kind": "download-client",
                "id": "example",
                "label": "Example",
                "fields": [
                    { "key": "url", "label": "field.url", "type": "string", "required": true },
                    { "key": "password", "label": "field.password", "type": "string", "secret": true }
                ]
            }]
        }"#;
        let mut reg = Registry::new();
        reg.register(Box::new(EmbeddedModule::iconless(MANIFEST)));
        let m = reg.manifests().into_iter().find(|m| m.id == "tv.kroma.engine.example").unwrap();
        let cap = &m.provides[0];
        assert_eq!(cap.kind, "download-client");
        assert_eq!(cap.label.as_deref(), Some("Example"));
        assert_eq!(cap.fields.len(), 2);
        assert!(cap.fields[1].secret, "the secret flag must survive registration");
    }

    const BARE: &str = r#"{ "id": "tv.kroma.example", "name": "Example", "version": "0.1.0" }"#;

    #[test]
    fn each_constructor_labels_the_icon_with_the_content_type_the_route_will_serve() {
        let svg = EmbeddedModule::new(BARE, b"<svg/>").icon().expect("an svg icon");
        assert_eq!(svg.content_type, "image/svg+xml");
        assert_eq!(svg.bytes, b"<svg/>");

        let png = EmbeddedModule::with_png(BARE, b"\x89PNG").icon().expect("a png icon");
        assert_eq!(png.content_type, "image/png");
        assert_eq!(png.bytes, b"\x89PNG");

        let webp = EmbeddedModule::with_icon(BARE, b"RIFF", "image/webp").icon().expect("a webp icon");
        assert_eq!(webp.content_type, "image/webp");

        assert!(EmbeddedModule::iconless(BARE).icon().is_none());
    }

    #[test]
    fn the_registry_serves_an_embedded_modules_icon_by_id() {
        let mut reg = Registry::new();
        reg.register(Box::new(EmbeddedModule::new(BARE, b"<svg/>")));
        assert_eq!(reg.icon_of("tv.kroma.example").expect("icon").content_type, "image/svg+xml");
        assert!(reg.icon_of("tv.kroma.absent").is_none());
    }
}
