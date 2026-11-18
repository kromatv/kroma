//! Importers, the core's half. An importer is whichever module answers the
//! `importer` point: it reads another media server and describes it, and the
//! core decides what that becomes and does every write.
//!
//! An answer is untrusted input. The core reads at most the bytes its method
//! allows, parses them into [`crate::domain::import`] and holds the result to
//! `bounds`. The sign-in to the other server stays with the importer: what
//! passes through here is the reference the importer gave for it.

mod asks;
mod bounds;

use serde::Serialize;
use serde::de::{DeserializeOwned, IgnoredAny};

use crate::domain::import::{Connected, PlayPage, StatePage, Survey, TitlePage};
use crate::point::{Allowance, Point, Silence};

pub use asks::*;
pub(crate) use bounds::id as bounded_id;
pub use bounds::MAX_PAGE_ROWS;

pub const POINT: &str = "importer";

const KIB: usize = 1024;
const MAX_REASON_CHARS: usize = 300;

struct Method {
    name: &'static str,
    allowance: Allowance,
}

const CONNECT: Method = Method {
    name: "connect",
    allowance: Allowance {
        seconds: 60,
        bytes: 64 * KIB,
    },
};
const SURVEY: Method = Method {
    name: "survey",
    allowance: Allowance {
        seconds: 120,
        bytes: 2 * KIB * KIB,
    },
};
const TITLES: Method = Method {
    name: "titles",
    allowance: PAGE,
};
const STATES: Method = Method {
    name: "states",
    allowance: PAGE,
};
const PLAYS: Method = Method {
    name: "plays",
    allowance: PAGE,
};
const FORGET: Method = Method {
    name: "forget",
    allowance: Allowance {
        seconds: 30,
        bytes: 4 * KIB,
    },
};
const PAGE: Allowance = Allowance {
    seconds: 120,
    bytes: 4 * KIB * KIB,
};

/// Why an importer gave the core nothing to use: no running module with that
/// id answers the point, the importer said in its own words why it could not,
/// or what it answered is not the contract's.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Unanswered {
    Absent,
    Failed(String),
    Unreadable(String),
}

#[derive(Serialize)]
struct Paged<'a, A> {
    #[serde(flatten)]
    ask: &'a A,
    limit: usize,
}

/// The modules answering the `importer` point, each called by its module id.
pub struct Importers {
    point: Point,
}

impl Importers {
    pub fn new(point: Point) -> Self {
        Self { point }
    }

    /// The id of every importer running right now.
    pub fn answering(&self) -> Vec<String> {
        self.point.answering()
    }

    /// Start a sign-in to another server, or ask how one in progress stands.
    pub fn connect(&self, importer: &str, ask: &ConnectAsk) -> Result<Connected, Unanswered> {
        let mut answer: Connected = self.ask(importer, &CONNECT, ask)?;
        bounds::connected(&answer).map_err(Unanswered::Unreadable)?;
        if let Connected::Refused { message, .. } = &mut answer {
            *message = message.take().map(|said| clipped(&said));
        }
        Ok(answer)
    }

    /// What one server of a sign-in holds.
    pub fn survey(&self, importer: &str, ask: &SurveyAsk) -> Result<Survey, Unanswered> {
        let answer: Survey = self.ask(importer, &SURVEY, ask)?;
        bounds::survey(&answer).map_err(Unanswered::Unreadable)?;
        Ok(answer)
    }

    /// One page of a library's titles, [`MAX_PAGE_ROWS`] at most.
    pub fn titles(&self, importer: &str, ask: &TitlesAsk) -> Result<TitlePage, Unanswered> {
        let answer: TitlePage = self.page(importer, &TITLES, ask)?;
        bounds::titles(&answer).map_err(Unanswered::Unreadable)?;
        Ok(answer)
    }

    /// One page of one user's watch state in one library, [`MAX_PAGE_ROWS`] at most.
    pub fn states(&self, importer: &str, ask: &StatesAsk) -> Result<StatePage, Unanswered> {
        let answer: StatePage = self.page(importer, &STATES, ask)?;
        bounds::states(&answer).map_err(Unanswered::Unreadable)?;
        Ok(answer)
    }

    /// One page of a server's plays, [`MAX_PAGE_ROWS`] at most.
    pub fn plays(&self, importer: &str, ask: &PlaysAsk) -> Result<PlayPage, Unanswered> {
        let answer: PlayPage = self.page(importer, &PLAYS, ask)?;
        bounds::plays(&answer).map_err(Unanswered::Unreadable)?;
        Ok(answer)
    }

    /// Have the importer delete a sign-in it keeps. One it does not hold is
    /// forgotten already.
    pub fn forget(&self, importer: &str, ask: &ForgetAsk) -> Result<(), Unanswered> {
        self.ask::<_, IgnoredAny>(importer, &FORGET, ask)
            .map(|_| ())
    }

    fn page<A: Serialize, T: DeserializeOwned>(
        &self,
        importer: &str,
        method: &Method,
        ask: &A,
    ) -> Result<T, Unanswered> {
        let paged = Paged {
            ask,
            limit: MAX_PAGE_ROWS,
        };
        self.ask(importer, method, &paged)
    }

    fn ask<A: Serialize, T: DeserializeOwned>(
        &self,
        importer: &str,
        method: &Method,
        ask: &A,
    ) -> Result<T, Unanswered> {
        let bytes = self
            .point
            .bytes_from(importer, method.name, ask, method.allowance)
            .map_err(|silence| unanswered(method, silence))?;
        let answer: Result<T, String> = serde_json::from_slice(&bytes)
            .map_err(|e| Unanswered::Unreadable(clipped(&e.to_string())))?;
        answer.map_err(|reason| Unanswered::Failed(clipped(&reason)))
    }
}

fn unanswered(method: &Method, silence: Silence) -> Unanswered {
    match silence {
        Silence::Absent => Unanswered::Absent,
        Silence::Failed(error) => Unanswered::Unreadable(clipped(&error)),
        Silence::TooLarge => Unanswered::Unreadable(format!(
            "an answer to {} past {} bytes",
            method.name, method.allowance.bytes
        )),
    }
}

fn clipped(said: &str) -> String {
    said.chars().take(MAX_REASON_CHARS).collect()
}

#[cfg(test)]
mod tests;
