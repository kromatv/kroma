//! The KROMA module SDK: the ONE crate a server module depends on.
//!
//! A module must not depend on `kroma-engine`, `kroma-db`, `kroma-domain`,
//! `kroma-sqlite`, `kroma-module-wire`, `kroma-http` or `kroma-i18n` directly.
//! This facade re-exports the manifest layer at the crate root
//! (`EmbeddedModule`, `ModuleManifest`, `Registry`, ...) and mirrors the host /
//! engine / domain / http / i18n / db / primitives surface under submodules, so
//! a module writes `kroma_module_sdk::engine::state::SharedState` instead of
//! reaching into the core crate.
//!
//! What is NOT here is any description of what a module is for. A module reaches
//! a peer by asking [`host::HostCtx::contributions`] for a point NAME and calling
//! it with JSON both sides declare themselves; there is no trait here for
//! torznab, or downloads, or anything else, because the core cannot enumerate the
//! things modules will do. See docs/module-plugin-model.md.

// Manifest layer (below engine): EmbeddedModule / Module / ModuleManifest /
// Registry / capability + config types. Re-exported at the crate root.
pub use kroma_module_manifest::*;

/// `embedded_module!()` builds a module's `MODULE` const by discovering its
/// `module.json` + `icon.<ext>` at compile time. Write
/// `pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();`.
pub use kroma_module_macros::embedded_module;

/// `embedded_locales!()` collects a module's `locales/<code>.json` at compile
/// time into the `&[(code, json)]` [`i18n::engine`] takes. Write
/// `const LOCALES: &[(&str, &str)] = kroma_module_sdk::embedded_locales!();`.
pub use kroma_module_macros::embedded_locales;

/// Host contract: the `ServerModule` trait, `HostCtx`, the point resolvers and
/// the `service` helper, and the `async_trait` re-export module impls need.
pub mod host {
    pub use kroma_module_host::*;
}

/// The application surface: `state::SharedState`, `services::*`, `model::*`.
/// Behind the `engine` feature: this is the whole core, and only the two modules
/// that orchestrate it (acquisition, torrents) have any use for it.
#[cfg(feature = "engine")]
pub mod engine {
    pub use kroma_engine::*;
}

/// What the host and a module exchange: the session user and its permissions,
/// notifications and their audience, metadata answers. Behind the `domain`
/// feature, the whole of `kroma-domain` on top, for a first-party module that
/// reads the core's own shapes.
pub mod domain {
    #[cfg(feature = "domain")]
    pub use kroma_domain::*;
    pub use kroma_module_wire::*;
}

/// The outbound HTTP client (`Fetch`, `Response`).
pub mod http {
    pub use kroma_http::*;
}

/// The catalogs a module ships in `locales/`, resolved by the same engine the
/// core resolves its own with, so a plural or a `{name}` behaves the same in a
/// sidecar as it does on a screen.
pub mod i18n {
    pub use kroma_i18n::*;

    /// The locale a key falls back to: a module's `en.json` is the
    /// authoritative catalog, the one every other is a translation of.
    pub const FALLBACK_LOCALE: &str = "en";

    /// An engine over the catalogs [`crate::embedded_locales!`] found. A module
    /// that ships no English falls back to its first catalog instead; one that
    /// ships none at all is an error rather than an engine answering every key
    /// with itself.
    pub fn engine(catalogs: &[(&str, &str)]) -> Result<I18n, BuildError> {
        let fallback = catalogs
            .iter()
            .map(|(code, _)| *code)
            .find(|code| *code == FALLBACK_LOCALE)
            .or_else(|| catalogs.first().map(|(code, _)| *code))
            .unwrap_or(FALLBACK_LOCALE);
        catalogs
            .iter()
            .fold(
                I18n::builder().default_locale(fallback).plural_rule(cldr),
                |builder, (code, json)| builder.catalog_json(*code, *json),
            )
            .build()
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        const EN: &str = r#"{ "items": "{count} items", "items_one": "{count} item" }"#;
        const FR: &str = r#"{ "items": "{count} objets", "items_one": "{count} objet" }"#;
        const CATALOGS: &[(&str, &str)] = &[("en", EN), ("fr", FR)];

        #[test]
        fn a_count_picks_the_variant_the_readers_own_language_declares() {
            let i18n = engine(CATALOGS).expect("two catalogs");

            assert_eq!(i18n.t("fr", "items", &[("count", "0")]), "0 objet");
            assert_eq!(i18n.t("en", "items", &[("count", "0")]), "0 items");
            assert_eq!(i18n.t("fr", "items", &[("count", "2")]), "2 objets");
        }

        #[test]
        fn english_leads_whatever_order_the_catalogs_arrived_in() {
            let reversed: Vec<(&str, &str)> = CATALOGS.iter().rev().copied().collect();

            assert_eq!(engine(&reversed).unwrap().default_locale(), "en");
            assert_eq!(engine(CATALOGS).unwrap().default_locale(), "en");
        }

        #[test]
        fn a_module_with_no_english_resolves_against_the_catalog_it_does_ship() {
            let only_french = engine(&CATALOGS[1..]).expect("one catalog");

            assert_eq!(only_french.default_locale(), "fr");
            assert_eq!(only_french.t("en", "items", &[("count", "1")]), "1 objet");
            assert!(engine(&[]).is_err());
        }
    }
}

/// Direct SQLite access: the pool, the grant and a module's own migrations.
/// Behind the `storage` feature, which a module turns on when its `module.json`
/// declares `storage`; the pools themselves come from `host::HostStorage`, not
/// from here. Under `engine`, every query the core makes of its own database as
/// well.
#[cfg(feature = "storage")]
pub mod db {
    #[cfg(feature = "engine")]
    pub use kroma_db::*;
    pub use kroma_sqlite::{
        apply_migrations, init_scoped, open, open_with, Grant, Pool, PoolInner, PooledConn,
    };
    #[cfg(all(any(test, feature = "testing"), not(feature = "core")))]
    pub use kroma_sqlite::testing;
    /// `temp_pool` stamps the core schema, for a grant test that has to run
    /// against the real tables rather than a copy of them.
    #[cfg(all(any(test, feature = "testing"), feature = "core"))]
    pub use kroma_db::testing;
}

/// Small shared primitives (`now_ms`, ...).
pub mod primitives {
    pub use kroma_primitives::*;
}

/// What a module's tests reach: `serve` / `blocking` stand a point's provider up
/// on a real socket for a test that drives both ends, and `TempDir` / `temp_dir`
/// are the self-deleting scratch dir. The `StubHost` double is
/// `host::testing::StubHost`, and a throwaway pool is `db::testing::temp_pool`.
#[cfg(any(test, feature = "testing"))]
pub mod testing {
    pub use kroma_module_host::test_serve::*;
    pub use kroma_testing::*;
}
