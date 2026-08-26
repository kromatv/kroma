//! Build-time expansion of `$t(other.key)` references inside catalog values,
//! so a term written in one place reads the same everywhere it is quoted.
//!
//! Runs once, in [`crate::Builder::build`], which is what lets
//! [`crate::interpolate`] stay a single pass: a variable carrying user text can
//! never reach back into the catalog.

use std::collections::{HashMap, HashSet};

/// Where a `$t(...)` reference sits in a template, and which key it names.
struct Ref {
    start: usize,
    end: usize,
    key: String,
}

fn next_ref(template: &str, mut from: usize) -> Option<Ref> {
    loop {
        let start = template[from..].find("$t(")? + from;
        let open = start + 3;
        let close = template[open..].find(')')? + open;
        let key = template[open..close].trim();
        if key.is_empty()
            || !key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        {
            from = open;
            continue;
        }
        return Some(Ref {
            start,
            end: close + 1,
            key: key.to_string(),
        });
    }
}

/// Whether `template` still names a key, i.e. [`expand_refs`] could not resolve
/// it. A catalog that ships one of these has a typo or a cycle.
pub fn has_unresolved_ref(template: &str) -> bool {
    next_ref(template, 0).is_some()
}

fn resolve(
    key: &str,
    own: &HashMap<String, String>,
    fallback: &HashMap<String, String>,
    done: &mut HashMap<String, String>,
    visiting: &mut HashSet<String>,
) -> Option<String> {
    if let Some(cached) = done.get(key) {
        return Some(cached.clone());
    }
    if visiting.contains(key) {
        return None;
    }
    let template = own.get(key).or_else(|| fallback.get(key))?.clone();

    visiting.insert(key.to_string());
    let mut out = String::with_capacity(template.len());
    let mut at = 0;
    while let Some(r) = next_ref(&template, at) {
        out.push_str(&template[at..r.start]);
        match resolve(&r.key, own, fallback, done, visiting) {
            Some(value) => out.push_str(&value),
            None => out.push_str(&template[r.start..r.end]),
        }
        at = r.end;
    }
    out.push_str(&template[at..]);
    visiting.remove(key);

    done.insert(key.to_string(), out.clone());
    Some(out)
}

/// Expand every `$t(...)` reference in `own`, resolving against `own` first and
/// then `fallback`. A reference naming a missing key, or closing a cycle, is
/// left standing rather than failing the build: a catalog is data, and a bad
/// entry must not stop the server from booting. Guard the shipped catalogs with
/// [`has_unresolved_ref`] in a test instead.
pub fn expand_refs(
    own: HashMap<String, String>,
    fallback: &HashMap<String, String>,
) -> HashMap<String, String> {
    // Most catalogs quote nothing. Reproducing a few thousand entries exactly,
    // allocating twice per key to do it, is the whole cost of the feature for
    // everyone not using it, and this runs at boot.
    if !own.values().any(|t| t.contains("$t(")) {
        return own;
    }
    let mut done = HashMap::with_capacity(own.len());
    let mut visiting = HashSet::new();
    let mut out = HashMap::with_capacity(own.len());
    for (key, template) in &own {
        if !template.contains("$t(") {
            out.insert(key.clone(), template.clone());
            continue;
        }
        let value = resolve(key, &own, fallback, &mut done, &mut visiting)
            .unwrap_or_else(|| template.clone());
        out.insert(key.clone(), value);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cat(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect()
    }

    #[test]
    fn a_reference_is_replaced_by_the_value_it_names() {
        let own = cat(&[("brand", "KROMA"), ("hi", "Welcome to $t(brand)")]);

        let out = expand_refs(own, &HashMap::new());

        assert_eq!(out["hi"], "Welcome to KROMA");
    }

    #[test]
    fn a_reference_resolves_in_its_own_locale_before_the_default() {
        let own = cat(&[("unit", "saison"), ("of", "Une $t(unit)")]);
        let fallback = cat(&[("unit", "season")]);

        let out = expand_refs(own, &fallback);

        assert_eq!(out["of"], "Une saison");
    }

    #[test]
    fn a_reference_the_locale_does_not_define_falls_back_to_the_default() {
        let own = cat(&[("hi", "Bonjour $t(brand)")]);
        let fallback = cat(&[("brand", "KROMA")]);

        let out = expand_refs(own, &fallback);

        assert_eq!(out["hi"], "Bonjour KROMA");
    }

    #[test]
    fn a_chain_of_references_expands_all_the_way_down() {
        let own = cat(&[("a", "A"), ("b", "$t(a)B"), ("c", "$t(b)C")]);

        let out = expand_refs(own, &HashMap::new());

        assert_eq!(out["c"], "ABC");
    }

    #[test]
    fn a_reference_to_a_missing_key_is_left_standing() {
        let own = cat(&[("hi", "Hello $t(nope)")]);

        let out = expand_refs(own, &HashMap::new());

        assert_eq!(out["hi"], "Hello $t(nope)");
        assert!(has_unresolved_ref(&out["hi"]));
    }

    #[test]
    fn a_cycle_is_broken_rather_than_recursed_forever() {
        let own = cat(&[("a", "x$t(b)"), ("b", "y$t(a)")]);

        let out = expand_refs(own, &HashMap::new());

        assert!(has_unresolved_ref(&out["a"]));
    }

    #[test]
    fn a_value_with_no_reference_is_untouched() {
        let own = cat(&[("hi", "Hello {name}"), ("odd", "cost: $t( ) and $tx")]);

        let out = expand_refs(own, &HashMap::new());

        assert_eq!(out["hi"], "Hello {name}");
        assert_eq!(out["odd"], "cost: $t( ) and $tx");
    }
}
