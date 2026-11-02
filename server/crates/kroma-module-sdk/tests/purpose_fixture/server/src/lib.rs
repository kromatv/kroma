use kroma_module_sdk::http::Fetch;

pub fn details(url: &str) -> bool {
    Fetch::new()
        .purpose("metadata")
        .max_time(1)
        .get(url)
        .is_ok()
}

pub fn discover(url: &str) -> bool {
    Fetch::new()
        .purpose("metadata.discover")
        .max_time(1)
        .get(url)
        .is_ok()
}

pub fn artwork(url: &str) -> bool {
    Fetch::new()
        .purpose("artwork")
        .max_time(1)
        .get(url)
        .is_ok()
}

#[cfg(test)]
mod tests {
    const NOTHING_LISTENS: &str = "http://127.0.0.1:9/";

    #[test]
    fn details_leave_for_the_declared_purpose() {
        assert!(!super::details(NOTHING_LISTENS));
    }

    #[test]
    fn discover_leaves_for_a_child_of_the_declared_purpose() {
        assert!(!super::discover(NOTHING_LISTENS));
    }

    #[test]
    fn artwork_leaves_for_a_purpose_the_manifest_does_not_declare() {
        assert!(!super::artwork(NOTHING_LISTENS));
    }
}
