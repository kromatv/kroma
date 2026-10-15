/// The query a program's URLs carry so a `<video>` element arrives
/// authenticated, since a media element attaches no header of its own:
/// `?<param>=<value>`, and empty where the caller has none.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Credential(String);

impl Credential {
    pub fn new(param: &str, value: Option<&str>) -> Self {
        Credential(value.map(|v| format!("?{param}={v}")).unwrap_or_default())
    }

    /// What to append to a URL, empty when there is nothing to carry.
    pub fn query(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_value_becomes_the_query_every_url_of_the_program_gains() {
        let carried = Credential::new("t", Some("dev.999.sig"));

        assert_eq!(carried.query(), "?t=dev.999.sig");
    }

    #[test]
    fn a_caller_with_nothing_to_present_appends_nothing() {
        assert_eq!(Credential::new("t", None).query(), "");
    }
}
