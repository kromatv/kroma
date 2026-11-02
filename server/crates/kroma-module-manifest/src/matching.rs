//! The two matchers every decision on a module's call shares: the manifest's
//! `net.connect` check, the operator's rules, the journal's filter and the
//! gateway.

/// Whether a declaration, a rule or a filter naming `named` covers a call made
/// for `purpose`: the purpose itself or one of its dotted children, so
/// `metadata` covers `metadata.discover` and never `metadatax`. An empty name
/// covers nothing.
pub fn purpose_covers(named: &str, purpose: &str) -> bool {
    !named.is_empty()
        && purpose
            .strip_prefix(named)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('.'))
}

/// Whether `host` is one `pattern` names: that host exactly, or for `*.domain`
/// the domain and every name under it. Case and a trailing dot on `host` are
/// ignored. An empty pattern names nothing.
pub fn host_matches(pattern: &str, host: &str) -> bool {
    let host = host.trim_end_matches('.').as_bytes();
    let (domain, under) = match pattern.strip_prefix("*.") {
        Some(domain) => (domain.as_bytes(), true),
        None => (pattern.as_bytes(), false),
    };
    if domain.is_empty() {
        return false;
    }
    if host.eq_ignore_ascii_case(domain) {
        return true;
    }
    under && host.len() > domain.len() + 1 && {
        let (label, suffix) = host.split_at(host.len() - domain.len());
        label.ends_with(b".") && suffix.eq_ignore_ascii_case(domain)
    }
}

#[cfg(test)]
mod tests;
