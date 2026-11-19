//! `household.import` brings a household over from another media server: the
//! import the owner started from the review screen, read through its importer.

use super::prelude::*;

pub(super) const SPEC: Builtin = Builtin {
    key: crate::services::imports::JOB,
    category: Category::Library,
    schedule: None,
    triggers: &[],
    run: crate::services::imports::run,
};
