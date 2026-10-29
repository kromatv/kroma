//! Turning what a notification is about into where its reader should go: the
//! one table a route rename is edited in, which every stored row then follows.

use kroma_db::notifications::{RequestedTitle, StoredNotification, SubjectFacts};
use kroma_domain::{
    NotificationActor, NotificationEvent, NotificationSubject, RequestKind, SubjectKind,
};

/// The route and the actor a page of rows renders with. [`SubjectFacts`] is the
/// database half; the default resolves nothing, which is what a preview wants.
#[derive(Debug, Default)]
pub struct Subjects(SubjectFacts);

impl From<SubjectFacts> for Subjects {
    fn from(facts: SubjectFacts) -> Self {
        Self(facts)
    }
}

impl Subjects {
    /// Where the row points, falling back to the `link` its producer stored.
    pub fn link(&self, row: &StoredNotification) -> Option<String> {
        row.subject
            .as_ref()
            .and_then(|subject| self.route(subject, row.event))
            .or_else(|| row.link.clone())
    }

    /// Who caused the event, named as their account reads now.
    pub fn actor(&self, row: &StoredNotification) -> Option<NotificationActor> {
        let id = row.actor_id.as_deref()?;
        self.0.actors.get(id).cloned()
    }

    fn route(&self, subject: &NotificationSubject, event: NotificationEvent) -> Option<String> {
        let id = subject.id.as_str();
        match subject.kind.as_str() {
            SubjectKind::REQUEST => Some(self.request_route(id, event)),
            SubjectKind::MOVIE | SubjectKind::EPISODE => Some(format!("/movies/{id}")),
            SubjectKind::SHOW => Some(format!("/shows/{id}")),
            SubjectKind::REPORT => Some("/admin/reports".to_string()),
            SubjectKind::JOB => Some("/admin/jobs".to_string()),
            _ => None,
        }
    }

    fn request_route(&self, request_id: &str, event: NotificationEvent) -> String {
        if event == NotificationEvent::RequestSubmitted {
            return format!("/admin/requests/{request_id}");
        }
        self.0
            .titles
            .get(request_id)
            .map(title_route)
            .unwrap_or_else(|| "/requests".to_string())
    }
}

fn title_route(title: &RequestedTitle) -> String {
    match title.kind {
        RequestKind::Movie => format!("/movies/{}", title.id),
        RequestKind::Show => format!("/shows/{}", title.id),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use kroma_domain::NotificationCategory;

    use super::*;

    fn row(event: NotificationEvent, subject: Option<NotificationSubject>) -> StoredNotification {
        StoredNotification {
            id: "n1".into(),
            category: NotificationCategory::Requests,
            event,
            title_key: "notifications.request.submitted.title".into(),
            body_key: "notifications.request.submitted.body".into(),
            params: Default::default(),
            subject,
            actor_id: None,
            data: None,
            dedupe_key: None,
            link: Some("/admin/requests".into()),
            image_url: None,
            actions: Vec::new(),
            push_category: None,
            read: false,
            created_at: 0,
        }
    }

    fn knowing(request_id: &str, title: RequestedTitle) -> Subjects {
        SubjectFacts {
            titles: HashMap::from([(request_id.to_string(), title)]),
            actors: HashMap::new(),
        }
        .into()
    }

    #[test]
    fn a_submitted_request_opens_the_request_a_moderator_decides() {
        let subjects = Subjects::default();

        let link = subjects.link(&row(
            NotificationEvent::RequestSubmitted,
            Some(NotificationSubject::request("req-7")),
        ));

        assert_eq!(link.as_deref(), Some("/admin/requests/req-7"));
    }

    #[test]
    fn a_requester_waits_on_the_requests_page_until_the_title_arrives() {
        let subjects = Subjects::default();

        let link = subjects.link(&row(
            NotificationEvent::RequestAvailable,
            Some(NotificationSubject::request("req-7")),
        ));

        assert_eq!(link.as_deref(), Some("/requests"));
    }

    #[test]
    fn a_requester_opens_the_title_once_it_is_in_the_catalogue() {
        let subjects = knowing(
            "req-7",
            RequestedTitle {
                kind: RequestKind::Movie,
                id: "item-9".into(),
            },
        );

        let link = subjects.link(&row(
            NotificationEvent::RequestAvailable,
            Some(NotificationSubject::request("req-7")),
        ));

        assert_eq!(link.as_deref(), Some("/movies/item-9"));
    }

    #[test]
    fn a_requested_show_opens_the_show_rather_than_an_item() {
        let subjects = knowing(
            "req-7",
            RequestedTitle {
                kind: RequestKind::Show,
                id: "shw".into(),
            },
        );

        let link = subjects.link(&row(
            NotificationEvent::RequestApproved,
            Some(NotificationSubject::request("req-7")),
        ));

        assert_eq!(link.as_deref(), Some("/shows/shw"));
    }

    #[test]
    fn each_catalogue_kind_opens_the_page_that_shows_it() {
        let subjects = Subjects::default();
        let at = |subject| subjects.link(&row(NotificationEvent::MediaAdded, Some(subject)));

        assert_eq!(
            at(NotificationSubject::movie("m1")).as_deref(),
            Some("/movies/m1")
        );
        assert_eq!(
            at(NotificationSubject::episode("e1")).as_deref(),
            Some("/movies/e1")
        );
        assert_eq!(
            at(NotificationSubject::show("s1")).as_deref(),
            Some("/shows/s1")
        );
        assert_eq!(
            at(NotificationSubject::report("rep1")).as_deref(),
            Some("/admin/reports")
        );
        assert_eq!(
            at(NotificationSubject::job("library.scan")).as_deref(),
            Some("/admin/jobs")
        );
    }

    #[test]
    fn a_row_written_before_subjects_existed_keeps_the_link_it_was_given() {
        let subjects = Subjects::default();

        let link = subjects.link(&row(NotificationEvent::RequestSubmitted, None));

        assert_eq!(link.as_deref(), Some("/admin/requests"));
    }

    #[test]
    fn a_kind_only_a_module_knows_falls_back_to_its_link() {
        let subjects = Subjects::default();

        let link = subjects.link(&row(
            NotificationEvent::Custom,
            Some(NotificationSubject::new("tv.kroma.torrents/torrent", "abc")),
        ));

        assert_eq!(link.as_deref(), Some("/admin/requests"));
    }

    #[test]
    fn an_actor_whose_account_is_gone_is_left_unnamed() {
        let subjects = Subjects::default();
        let mut row = row(NotificationEvent::RequestSubmitted, None);
        row.actor_id = Some("ghost".into());

        assert_eq!(subjects.actor(&row), None);
    }
}
