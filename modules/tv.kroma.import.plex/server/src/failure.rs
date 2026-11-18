use std::fmt;

/// Why plex.tv or a server gave the importer nothing to use, with the name of
/// which one it was.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Failure {
    Unreached(&'static str),
    Denied(&'static str),
    Status(&'static str, u16),
    Unreadable(&'static str),
}

impl Failure {
    /// Whether the other end answered at all. A call it refused, or answered
    /// with nothing where something optional was asked, is still an answer.
    pub(crate) fn is_an_answer(self) -> bool {
        matches!(self, Self::Denied(_) | Self::Status(..))
    }
}

impl fmt::Display for Failure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unreached(who) => write!(f, "{who} did not answer"),
            Self::Denied(who) => {
                write!(f, "{who} refused the sign-in: sign in to Plex again")
            }
            Self::Status(who, status) => write!(f, "{who} answered HTTP {status}"),
            Self::Unreadable(who) => {
                write!(f, "{who} gave an answer this importer cannot read")
            }
        }
    }
}

impl std::error::Error for Failure {}
