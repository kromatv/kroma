//! How the watch log may be ordered.

/// A column the watch log may be ordered by. Nothing outside this enum reaches
/// the `ORDER BY`, so an unknown column name is refused rather than bound.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PlayColumn {
    Username,
    Kind,
    Title,
    Player,
    Device,
    #[default]
    EndedAt,
    WatchedMs,
}

impl PlayColumn {
    pub fn parse(name: &str) -> Option<PlayColumn> {
        match name {
            "username" => Some(PlayColumn::Username),
            "kind" => Some(PlayColumn::Kind),
            "title" => Some(PlayColumn::Title),
            "player" => Some(PlayColumn::Player),
            "device" => Some(PlayColumn::Device),
            "endedAt" => Some(PlayColumn::EndedAt),
            "watchedMs" => Some(PlayColumn::WatchedMs),
            _ => None,
        }
    }

    fn sql(self) -> &'static [&'static str] {
        match self {
            PlayColumn::Username => &["h.username"],
            PlayColumn::Kind => &["h.kind"],
            PlayColumn::Title => &["COALESCE(h.show_title,h.title)", "h.season", "h.episode"],
            PlayColumn::Player => &["h.player"],
            PlayColumn::Device => &["h.device"],
            PlayColumn::EndedAt => &["h.ended_at"],
            PlayColumn::WatchedMs => &["h.watched_ms"],
        }
    }
}

/// The default is the newest session first.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlaySort {
    pub column: PlayColumn,
    pub descending: bool,
}

impl Default for PlaySort {
    fn default() -> Self {
        PlaySort {
            column: PlayColumn::default(),
            descending: true,
        }
    }
}

impl PlaySort {
    /// Parse `<column>:<asc|desc>`; `None` for an unknown column or direction.
    pub fn parse(value: &str) -> Option<PlaySort> {
        let (name, dir) = value.split_once(':').unwrap_or((value, "desc"));
        let descending = match dir {
            "desc" => true,
            "asc" => false,
            _ => return None,
        };
        Some(PlaySort {
            column: PlayColumn::parse(name)?,
            descending,
        })
    }

    pub(super) fn clause(self) -> String {
        let dir = if self.descending { "DESC" } else { "ASC" };
        let mut parts: Vec<String> = self
            .column
            .sql()
            .iter()
            .map(|col| format!("{col} {dir}"))
            .collect();
        parts.push("h.id ASC".into());
        parts.join(", ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_column_the_table_has_can_order_it() {
        assert_eq!(
            PlaySort::parse("username:asc"),
            Some(PlaySort {
                column: PlayColumn::Username,
                descending: false
            })
        );
        assert_eq!(
            PlaySort::parse("endedAt"),
            Some(PlaySort {
                column: PlayColumn::EndedAt,
                descending: true
            })
        );
        assert_eq!(PlaySort::parse("title:sideways"), None);
        assert_eq!(PlaySort::parse("ended_at:asc"), None);
        assert_eq!(PlaySort::parse("h.title; DROP TABLE users:asc"), None);
        assert_eq!(PlaySort::default().column, PlayColumn::EndedAt);
    }
}
