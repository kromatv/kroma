use super::*;

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct Given {
    pub(super) libraries: Vec<String>,
    pub(super) users: Vec<String>,
    pub(super) titles: Vec<String>,
    pub(super) states: Vec<String>,
    pub(super) plays: Vec<String>,
}

#[derive(Default)]
pub(super) struct Recording {
    pub(super) given: Mutex<Given>,
    pub(super) nothing_here: Vec<&'static str>,
    pub(super) left: Vec<&'static str>,
    pub(super) newer_here: Vec<&'static str>,
    pub(super) cancels_at_the_first_titles: Mutex<Option<Arc<RunHandle>>>,
}

impl Recording {
    pub(super) fn given(&self) -> Given {
        std::mem::take(&mut self.given.lock().unwrap())
    }

    pub(super) fn of_title(&self, title: &str) -> Outcome {
        if self.nothing_here.contains(&title) {
            Outcome::Unmatched
        } else if self.left.contains(&title) {
            Outcome::Untouched
        } else if self.newer_here.contains(&title) {
            Outcome::AlreadyHere
        } else {
            Outcome::Brought { target: None }
        }
    }
}

pub(super) fn became(what: &str, id: &str) -> Outcome {
    Outcome::Brought {
        target: Some(format!("{what}-{id}")),
    }
}

impl Stages for Recording {
    fn libraries(&self, _: &Importing<'_>, kept: &[LibraryRow<'_>]) -> Result<Vec<Outcome>> {
        let mut given = self.given.lock().unwrap();
        given.libraries.extend(
            kept.iter()
                .map(|row| format!("{} was {}", row.library.id, row.source.unwrap_or("nothing"))),
        );
        Ok(kept
            .iter()
            .map(|row| became("source", &row.library.id))
            .collect())
    }

    fn users(&self, _: &Importing<'_>, kept: &UserRows<'_>) -> Result<Vec<Outcome>> {
        let mut given = self.given.lock().unwrap();
        given.users.extend(
            kept.rows
                .iter()
                .map(|row| format!("{} was {}", row.user.id, row.account.unwrap_or("nothing"))),
        );
        Ok(kept
            .rows
            .iter()
            .map(|row| became("account", &row.user.id))
            .collect())
    }

    fn titles(&self, _: &Importing<'_>, page: &TitlePage<'_>) -> Result<Vec<Outcome>> {
        if let Some(run) = self.cancels_at_the_first_titles.lock().unwrap().take() {
            run.request_cancel();
        }
        let source = page.source.unwrap_or("nothing");
        let ids = page.titles.iter().map(|title| title.id.as_str());
        let mut given = self.given.lock().unwrap();
        given
            .titles
            .extend(ids.clone().map(|id| format!("{id} in {source}")));
        Ok(ids.map(|id| self.of_title(id)).collect())
    }

    fn states(&self, _: &Importing<'_>, page: &StatePage<'_>) -> Result<Vec<Outcome>> {
        let titles = page.rows.iter().map(|row| row.title.id.as_str());
        let mut given = self.given.lock().unwrap();
        given.states.extend(
            titles
                .clone()
                .map(|id| format!("{id} for {}", page.account)),
        );
        Ok(titles.map(|id| self.of_title(id)).collect())
    }

    fn plays(&self, _: &Importing<'_>, page: &[PlayRow<'_>]) -> Result<Vec<Outcome>> {
        let mut given = self.given.lock().unwrap();
        given.plays.extend(
            page.iter()
                .map(|row| format!("{} for {}", row.play.id, row.account)),
        );
        Ok(page
            .iter()
            .map(|row| self.of_title(&row.title.id))
            .collect())
    }
}
