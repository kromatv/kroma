use crate::domain::import::{Connected, PlayPage, StatePage, Survey, TitlePage};

pub const MAX_PAGE_ROWS: usize = 500;

const MAX_ID_BYTES: usize = 512;
const MAX_CURSOR_BYTES: usize = 2048;
const MAX_LINK_BYTES: usize = 2048;
const MAX_KEY_BYTES: usize = 64;

fn id(what: &str, value: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("an empty {what} id"));
    }
    if value.len() > MAX_ID_BYTES {
        return Err(format!("a {what} id past {MAX_ID_BYTES} bytes"));
    }
    Ok(())
}

fn link(url: &str) -> Result<(), String> {
    let plain = !url.chars().any(|c| c.is_whitespace() || c.is_control());
    if url.starts_with("https://") && url.len() <= MAX_LINK_BYTES && plain {
        Ok(())
    } else {
        Err("a sign-in link that is not a plain https address".to_string())
    }
}

fn key(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > MAX_KEY_BYTES {
        return Err(format!("a key that is empty or past {MAX_KEY_BYTES} bytes"));
    }
    Ok(())
}

fn page(rows: usize, next: Option<&str>) -> Result<(), String> {
    if rows > MAX_PAGE_ROWS {
        return Err(format!(
            "a page of {rows} rows, past the {MAX_PAGE_ROWS} asked for"
        ));
    }
    match next {
        Some(cursor) if cursor.is_empty() || cursor.len() > MAX_CURSOR_BYTES => Err(format!(
            "a cursor that is empty or past {MAX_CURSOR_BYTES} bytes"
        )),
        _ => Ok(()),
    }
}

pub(super) fn connected(answer: &Connected) -> Result<(), String> {
    match answer {
        Connected::Ready { sign_in, servers } => {
            id("sign-in", sign_in)?;
            servers
                .iter()
                .try_for_each(|server| id("server", &server.id))
        }
        Connected::Pending { pending, url, .. } => {
            id("pending sign-in", pending)?;
            link(url)
        }
        Connected::Refused { .. } => Ok(()),
    }
}

pub(super) fn survey(answer: &Survey) -> Result<(), String> {
    for library in &answer.libraries {
        id("library", &library.id)?;
    }
    for user in &answer.users {
        id("user", &user.id)?;
        user.libraries
            .iter()
            .try_for_each(|library| id("library", library))?;
        user.finer_limits
            .iter()
            .map(String::as_str)
            .try_for_each(key)?;
    }
    answer
        .left_behind
        .iter()
        .map(String::as_str)
        .try_for_each(key)
}

pub(super) fn titles(answer: &TitlePage) -> Result<(), String> {
    page(answer.titles.len(), answer.next.as_deref())?;
    answer
        .titles
        .iter()
        .try_for_each(|title| id("title", &title.id))
}

pub(super) fn states(answer: &StatePage) -> Result<(), String> {
    page(answer.states.len(), answer.next.as_deref())?;
    answer
        .states
        .iter()
        .try_for_each(|state| id("title", &state.title))
}

pub(super) fn plays(answer: &PlayPage) -> Result<(), String> {
    page(answer.plays.len(), answer.next.as_deref())?;
    for play in &answer.plays {
        id("play", &play.id)?;
        id("user", &play.user)?;
        id("title", &play.title)?;
    }
    Ok(())
}
