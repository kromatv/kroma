//! This module's registry entry: its manifest + packaged icon come from the
//! `module.json` / `icon.svg` at the module root, embedded at compile time.

use kroma_module_manifest::EmbeddedModule;

pub const MODULE: EmbeddedModule = kroma_module_manifest::embedded_module!();
