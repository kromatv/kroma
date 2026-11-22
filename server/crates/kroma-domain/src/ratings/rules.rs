//! What an admin decided about one title for one profile (ACCT-117 to
//! ACCT-120).

use serde::{Deserialize, Serialize};

/// A blocked title is kept from the profile whatever its rating; an allowed one
/// passes the profile's ceiling, rated or not. A title carries one rule or
/// none, and a show's rule covers every episode of it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TitleRule {
    Block,
    Allow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rule_reads_and_writes_as_its_lowercase_name() {
        let rules: Vec<TitleRule> = serde_json::from_str(r#"["block", "allow"]"#).unwrap();

        assert_eq!(rules, [TitleRule::Block, TitleRule::Allow]);
        assert_eq!(
            serde_json::to_string(&TitleRule::Allow).unwrap(),
            r#""allow""#
        );
        assert!(serde_json::from_str::<TitleRule>(r#""deny""#).is_err());
    }
}
