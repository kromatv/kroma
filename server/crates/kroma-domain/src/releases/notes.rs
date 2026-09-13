use serde::{Deserialize, Serialize};

/// One release's notes in one language, read from the fixed shape
/// `docs/release-notes.md` prescribes for `releases/<version>/<locale>.md`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNotes {
    pub action: Vec<String>,
    pub highlights: Vec<Highlight>,
    pub fixed: Vec<String>,
    pub owner: Vec<String>,
}

/// One change worth a card: a title, one paragraph, and at most one picture.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Highlight {
    pub title: String,
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<HighlightImage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightImage {
    pub url: String,
    pub alt: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Section {
    Action,
    New,
    Fixed,
    Owner,
}

const HEADINGS: [(&str, Section); 8] = [
    ("Action required", Section::Action),
    ("À faire", Section::Action),
    ("New", Section::New),
    ("Nouveautés", Section::New),
    ("Fixed", Section::Fixed),
    ("Corrections", Section::Fixed),
    ("For the server owner", Section::Owner),
    ("Pour le propriétaire du serveur", Section::Owner),
];

impl ReleaseNotes {
    /// Reads a notes file into plain text: emphasis, code and link marks are
    /// dropped, since a screen draws the words and not the markdown. A heading
    /// outside the four the doc names closes the section before it, and what
    /// sits under it is dropped.
    pub fn parse(markdown: &str) -> Self {
        let mut reader = Reader::default();
        for line in markdown.lines() {
            reader.line(line.trim());
        }
        reader.finish()
    }
}

#[derive(Default)]
struct Reader {
    notes: ReleaseNotes,
    section: Option<Section>,
    paragraph: String,
}

impl Reader {
    fn line(&mut self, line: &str) {
        if let Some(heading) = line.strip_prefix("## ") {
            self.flush();
            self.section = section_named(heading.trim());
        } else if let Some(title) = line.strip_prefix("### ") {
            self.flush();
            if self.section == Some(Section::New) {
                self.notes.highlights.push(Highlight {
                    title: plain(title.trim()),
                    body: String::new(),
                    image: None,
                });
            }
        } else if let Some(image) = image(line) {
            self.flush();
            if let (Some(Section::New), Some(highlight)) =
                (self.section, self.notes.highlights.last_mut())
            {
                highlight.image = Some(image);
            }
        } else if let Some(item) = line.strip_prefix("- ") {
            self.flush();
            self.paragraph.push_str(item.trim());
        } else if line.is_empty() {
            self.flush();
        } else {
            if !self.paragraph.is_empty() {
                self.paragraph.push(' ');
            }
            self.paragraph.push_str(line);
        }
    }

    fn flush(&mut self) {
        if self.paragraph.is_empty() {
            return;
        }
        let text = plain(&std::mem::take(&mut self.paragraph));
        match self.section {
            Some(Section::Action) => self.notes.action.push(text),
            Some(Section::Fixed) => self.notes.fixed.push(text),
            Some(Section::Owner) => self.notes.owner.push(text),
            Some(Section::New) => {
                if let Some(highlight) = self.notes.highlights.last_mut() {
                    if !highlight.body.is_empty() {
                        highlight.body.push(' ');
                    }
                    highlight.body.push_str(&text);
                }
            }
            None => {}
        }
    }

    fn finish(mut self) -> ReleaseNotes {
        self.flush();
        self.notes
    }
}

fn section_named(heading: &str) -> Option<Section> {
    HEADINGS
        .iter()
        .find(|(name, _)| *name == heading)
        .map(|&(_, section)| section)
}

fn image(line: &str) -> Option<HighlightImage> {
    let rest = line.strip_prefix("![")?;
    let (alt, rest) = rest.split_once("](")?;
    let url = rest.strip_suffix(')')?;
    Some(HighlightImage {
        url: url.trim().to_string(),
        alt: plain(alt.trim()),
    })
}

fn plain(text: &str) -> String {
    unlink(text).replace("**", "").replace("__", "").replace('`', "")
}

fn unlink(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('[') {
        let Some(close) = rest[open..].find("](").map(|at| open + at) else {
            break;
        };
        let Some(end) = rest[close + 2..].find(')').map(|at| close + 2 + at) else {
            break;
        };
        out.push_str(&rest[..open]);
        out.push_str(&rest[open + 1..close]);
        rest = &rest[end + 1..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_highlight_with_its_paragraph_and_its_picture() {
        let markdown = "
            ## New

            ### When a film ends, another is ready
            The player shows the closest title.

            ![The end-of-film screen](https://example.test/end.webp)
        ";

        let notes = ReleaseNotes::parse(markdown);

        assert_eq!(
            notes.highlights,
            vec![Highlight {
                title: "When a film ends, another is ready".into(),
                body: "The player shows the closest title.".into(),
                image: Some(HighlightImage {
                    url: "https://example.test/end.webp".into(),
                    alt: "The end-of-film screen".into(),
                }),
            }]
        );
    }

    #[test]
    fn joins_a_paragraph_wrapped_over_several_lines_into_one_body() {
        let markdown = "
            ## New

            ### A title
            The first half of the sentence
            and the second half.
        ";

        let notes = ReleaseNotes::parse(markdown);

        assert_eq!(
            notes.highlights[0].body,
            "The first half of the sentence and the second half."
        );
    }

    #[test]
    fn keeps_each_bullet_of_a_list_section_as_its_own_line() {
        let markdown = "
            ## Fixed

            - A paused film no longer starts again
              on its own.
            - Searching for a show returns the show.
        ";

        let notes = ReleaseNotes::parse(markdown);

        assert_eq!(
            notes.fixed,
            vec![
                "A paused film no longer starts again on its own.",
                "Searching for a show returns the show.",
            ]
        );
    }

    #[test]
    fn reads_the_french_headings_as_the_same_four_sections() {
        let markdown = "
            ## À faire

            - Sauvegardez avant de mettre à jour.

            ## Nouveautés

            ### Un titre
            Un paragraphe.

            ## Corrections

            - Un film en pause ne repart plus tout seul.

            ## Pour le propriétaire du serveur

            - Le journal aligne ses colonnes.
        ";

        let notes = ReleaseNotes::parse(markdown);

        assert_eq!(notes.action, vec!["Sauvegardez avant de mettre à jour."]);
        assert_eq!(notes.highlights.len(), 1);
        assert_eq!(notes.fixed, vec!["Un film en pause ne repart plus tout seul."]);
        assert_eq!(notes.owner, vec!["Le journal aligne ses colonnes."]);
    }

    #[test]
    fn drops_what_sits_under_a_heading_it_does_not_know() {
        let markdown = "
            ## Fixed

            - Kept.

            ## Internal

            - Dropped.
        ";

        let notes = ReleaseNotes::parse(markdown);

        assert_eq!(notes.fixed, vec!["Kept."]);
    }

    #[test]
    fn strips_the_emphasis_code_and_link_marks_a_plain_text_screen_cannot_draw() {
        let markdown = "
            ## Action required

            - Export a backup in **Admin > Backup**, pull `ghcr.io/kromatv/kroma`
              and read [the guide](https://kroma.tv/docs) first.
        ";

        let notes = ReleaseNotes::parse(markdown);

        assert_eq!(
            notes.action,
            vec!["Export a backup in Admin > Backup, pull ghcr.io/kromatv/kroma and read the guide first."]
        );
    }

    #[test]
    fn a_highlight_without_a_picture_has_no_image_field_on_the_wire() {
        let highlight = Highlight {
            title: "A title".into(),
            body: "A paragraph.".into(),
            image: None,
        };

        let json = serde_json::to_value(&highlight).unwrap();

        assert_eq!(
            json,
            serde_json::json!({ "title": "A title", "body": "A paragraph." })
        );
    }

    #[test]
    fn joins_two_paragraphs_under_one_highlight_into_one_body() {
        let markdown = "
            ## New

            ### A title
            The first paragraph.

            The second paragraph.
        ";

        let notes = ReleaseNotes::parse(markdown);

        assert_eq!(
            notes.highlights[0].body,
            "The first paragraph. The second paragraph."
        );
    }

    #[test]
    fn drops_a_paragraph_that_comes_before_any_highlight_title() {
        let markdown = "
            ## New

            A stray line with no title above it.

            ### A title
            Its paragraph.
        ";

        let notes = ReleaseNotes::parse(markdown);

        assert_eq!(notes.highlights.len(), 1);
        assert_eq!(notes.highlights[0].body, "Its paragraph.");
    }

    #[test]
    fn keeps_a_bracket_that_opens_no_link_as_plain_text() {
        let markdown = "
            ## Fixed

            - Season [2 no longer repeats.
            - A title [with](a half link stays.
        ";

        let notes = ReleaseNotes::parse(markdown);

        assert_eq!(
            notes.fixed,
            vec![
                "Season [2 no longer repeats.",
                "A title [with](a half link stays.",
            ]
        );
    }
}
