//! Who a provider says a person is, read out of the claims it sent.

use serde_json::{Map, Value};

const MAX_USERNAME_CHARS: usize = 40;

/// The claims this server acts on. Everything but `subject` is the provider's
/// word and may be missing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Person {
    pub subject: String,
    pub username: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub groups: Vec<String>,
}

fn text(claims: &Map<String, Value>, key: &str) -> Option<String> {
    claims
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

/// The value at `path`: the claim of that exact name when there is one (a
/// namespaced claim is a URL, dots included), else the path walked one
/// segment at a time (`realm_access.roles`).
fn claim_at<'a>(claims: &'a Map<String, Value>, path: &str) -> Option<&'a Value> {
    if let Some(exact) = claims.get(path) {
        return Some(exact);
    }
    let mut segments = path.split('.');
    let mut value = claims.get(segments.next()?)?;
    for segment in segments {
        value = value.as_object()?.get(segment)?;
    }
    Some(value)
}

fn groups(claims: &Map<String, Value>, path: &str) -> Vec<String> {
    match claim_at(claims, path.trim()) {
        Some(Value::Array(many)) => many
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect(),
        Some(Value::String(one)) if !one.is_empty() => vec![one.clone()],
        _ => Vec::new(),
    }
}

impl Person {
    pub fn from_claims(subject: &str, claims: &Map<String, Value>, group_claim: &str) -> Person {
        Person {
            subject: subject.to_string(),
            username: text(claims, "preferred_username"),
            email: text(claims, "email").map(|email| email.to_lowercase()),
            name: text(claims, "name"),
            groups: groups(claims, group_claim),
        }
    }

    pub fn is_in_one_of(&self, required: &[String]) -> bool {
        required.is_empty() || required.iter().any(|group| self.groups.contains(group))
    }

    /// The name a new account starts with: the provider's username (the part
    /// before the `@` when it is an address), else the person's name, else the
    /// start of their email.
    pub fn suggested_username(&self) -> String {
        let local = |address: &str| address.split('@').next().unwrap_or(address).to_string();
        let suggested = self
            .username
            .as_deref()
            .map(local)
            .or_else(|| self.name.clone())
            .or_else(|| self.email.as_deref().map(local))
            .unwrap_or_else(|| "member".to_string());
        suggested.chars().take(MAX_USERNAME_CHARS).collect()
    }

    /// What the account's own settings call this identity.
    pub fn label(&self) -> String {
        self.email
            .clone()
            .or_else(|| self.username.clone())
            .or_else(|| self.name.clone())
            .unwrap_or_else(|| self.subject.clone())
    }
}

/// Adds what the user info endpoint knows to an ID token's claims. The token
/// was signed and the user info was not, so the token wins every claim it has.
pub fn fill_missing(claims: &mut Map<String, Value>, user_info: Map<String, Value>) {
    for (key, value) in user_info {
        claims.entry(key).or_insert(value);
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn claims(value: Value) -> Map<String, Value> {
        value.as_object().cloned().unwrap()
    }

    fn person(value: Value) -> Person {
        Person::from_claims("sub-lea", &claims(value), "groups")
    }

    #[test]
    fn the_standard_claims_are_read_and_the_email_is_lowercased() {
        let lea = person(json!({
            "preferred_username": " lea ",
            "email": "Lea@ID.test",
            "name": "Léa Martin",
            "groups": ["family", "admins"],
        }));

        assert_eq!(lea.username.as_deref(), Some("lea"));
        assert_eq!(lea.email.as_deref(), Some("lea@id.test"));
        assert_eq!(lea.name.as_deref(), Some("Léa Martin"));
        assert_eq!(lea.groups, ["family", "admins"]);
        assert_eq!(lea.label(), "lea@id.test");
    }

    #[test]
    fn a_blank_or_mistyped_claim_reads_as_missing() {
        let nobody = person(json!({ "preferred_username": "  ", "email": 7, "groups": 3 }));

        assert_eq!(nobody.username, None);
        assert_eq!(nobody.email, None);
        assert!(nobody.groups.is_empty());
        assert_eq!(nobody.label(), "sub-lea");
        assert_eq!(nobody.suggested_username(), "member");
    }

    #[test]
    fn a_group_claim_can_be_one_string_a_nested_path_or_a_namespaced_name() {
        let one = person(json!({ "groups": "family" }));
        let nested = Person::from_claims(
            "s",
            &claims(json!({ "realm_access": { "roles": ["kroma", 4] } })),
            "realm_access.roles",
        );
        let namespaced = Person::from_claims(
            "s",
            &claims(json!({ "https://id.test/groups": ["kroma"] })),
            "https://id.test/groups",
        );
        let missing = Person::from_claims("s", &claims(json!({ "a": 1 })), "a.b.c");

        assert_eq!(one.groups, ["family"]);
        assert_eq!(nested.groups, ["kroma"]);
        assert_eq!(namespaced.groups, ["kroma"]);
        assert!(missing.groups.is_empty());
    }

    #[test]
    fn no_required_group_admits_everyone_and_one_match_is_enough() {
        let lea = person(json!({ "groups": ["family"] }));

        assert!(lea.is_in_one_of(&[]));
        assert!(lea.is_in_one_of(&["friends".into(), "family".into()]));
        assert!(!lea.is_in_one_of(&["friends".into()]));
    }

    #[test]
    fn a_username_is_suggested_from_the_best_claim_there_is() {
        let from_address = person(json!({ "preferred_username": "lea@corp.test" }));
        let from_name = person(json!({ "name": "Léa Martin", "email": "l@id.test" }));
        let from_email = person(json!({ "email": "lea.m@id.test" }));
        let long = person(json!({ "preferred_username": "x".repeat(80) }));

        assert_eq!(from_address.suggested_username(), "lea");
        assert_eq!(from_name.suggested_username(), "Léa Martin");
        assert_eq!(from_email.suggested_username(), "lea.m");
        assert_eq!(long.suggested_username().chars().count(), 40);
    }

    #[test]
    fn user_info_fills_gaps_and_never_overrides_the_signed_token() {
        let mut signed = claims(json!({ "sub": "sub-lea", "email": "lea@id.test" }));

        fill_missing(
            &mut signed,
            claims(json!({ "email": "owner@id.test", "groups": ["family"] })),
        );

        assert_eq!(signed["email"], "lea@id.test");
        assert_eq!(signed["groups"], json!(["family"]));
    }
}
