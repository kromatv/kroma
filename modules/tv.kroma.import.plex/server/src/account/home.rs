use super::{parsed, servers, Account, Ask, LARGE, PLEX_TV, SMALL};
use crate::failure::Failure;
use crate::xml::Element;

impl Account<'_> {
    /// The plex.tv token of the Home user `user`, which the owner's `token`
    /// switches to with that user's `pin`. The PIN goes in the form, never in
    /// the address.
    pub(crate) fn switch(&self, token: &str, (user, pin): (&str, &str)) -> Result<String, Failure> {
        let ask = Ask {
            path: &format!("/api/home/users/{user}/switch"),
            token: Some(token),
            query: Vec::new(),
            max_bytes: SMALL,
        };
        let answer = self
            .web
            .post(&self.call(&ask), &[("pin", pin)])
            .map_err(|_| Failure::Unreached(PLEX_TV))?;
        parsed(answer.status, &answer.body)?
            .text("authenticationToken")
            .ok_or(Failure::Unreadable(PLEX_TV))
    }

    /// The token the account of `token` holds for the server `machine`,
    /// whoever owns that server.
    pub(crate) fn server_token(
        &self,
        token: &str,
        machine: &str,
    ) -> Result<Option<String>, Failure> {
        let listed: Element = self.read(&resources(token))?;
        Ok(servers::token_for(&listed, machine))
    }
}

pub(super) fn resources(token: &str) -> Ask<'_> {
    Ask {
        path: "/api/v2/resources",
        token: Some(token),
        query: vec![
            ("includeHttps", "1".to_string()),
            ("includeRelay", "1".to_string()),
            ("includeIPv6", "1".to_string()),
        ],
        max_bytes: LARGE,
    }
}
