use serde::{Deserialize, Serialize};

/// Which account of this server a kept user gets. `Proposed` is the account
/// that holds the user's address, or a new one when none does. `New` is a new
/// account even then, and `Existing` is the account with that id.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AccountChoice {
    #[default]
    Proposed,
    New,
    Existing(String),
}

impl AccountChoice {
    pub fn is_proposed(&self) -> bool {
        matches!(self, Self::Proposed)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::imports::Selection;

    #[test]
    fn a_kept_user_says_which_account_they_get_and_no_answer_is_the_proposed_one() {
        let selection: Selection = serde_json::from_value(json!({ "users": [
            { "id": "42" },
            { "id": "43", "account": "new" },
            { "id": "44", "account": { "existing": "u-1" } },
        ]}))
        .unwrap();

        let choices: Vec<&AccountChoice> = selection.users.iter().map(|u| &u.account).collect();

        assert_eq!(
            choices,
            [
                &AccountChoice::Proposed,
                &AccountChoice::New,
                &AccountChoice::Existing("u-1".into()),
            ]
        );
        assert_eq!(
            serde_json::to_value(&selection.users).unwrap(),
            json!([
                { "id": "42" },
                { "id": "43", "account": "new" },
                { "id": "44", "account": { "existing": "u-1" } },
            ])
        );
    }
}
