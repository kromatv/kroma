//! What the official registry offers for one point: the modules an owner could
//! install to have something answer it. A registry the operator added offers
//! nothing here, so only the pinned catalog decides what a core screen lists.

use kroma_module_manifest::ConfigField;
use kroma_module_supervisor::Supervisor;

use super::catalog::{self, CatalogModule};
use crate::state::SharedState;

/// One module of the official registry that answers a point, with the label and
/// the form its contribution declares.
pub struct Offer {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub label: Option<String>,
    pub fields: Vec<ConfigField>,
}

/// The official registry's modules that answer `point`, and why the registry
/// could not be read when it could not.
pub async fn official(
    state: &SharedState,
    sup: &Supervisor,
    point: &str,
) -> (Vec<Offer>, Option<String>) {
    match catalog::fetch(sup, &catalog::registry_url(state)).await {
        Ok(listing) => (answering(listing.modules, point), None),
        Err(e) => (Vec::new(), Some(format!("{e:#}"))),
    }
}

fn answering(modules: Vec<CatalogModule>, point: &str) -> Vec<Offer> {
    modules
        .into_iter()
        .filter(|m| m.contributes.iter().any(|(answered, _)| answered == point))
        .map(|m| {
            let form = m.forms.into_iter().find(|form| form.point == point);
            let (label, fields) = form.map_or((None, Vec::new()), |f| (f.label, f.fields));
            Offer {
                id: m.id,
                name: m.name,
                icon: m.icon,
                label,
                fields,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::admin::store::catalog::{Form, test_module};

    fn field(key: &str) -> ConfigField {
        ConfigField {
            key: key.into(),
            label: format!("field.{key}"),
            kind: "string".into(),
            default: None,
            options: Vec::new(),
            placeholder: None,
            secret: key == "password",
            required: false,
        }
    }

    fn answers(id: &str, point: &str, form: Option<Form>) -> CatalogModule {
        let mut module = test_module(id, "1.0.0");
        module.contributes = vec![(point.to_string(), None)];
        module.forms = form.into_iter().collect();
        module
    }

    #[test]
    fn a_module_answering_the_point_is_offered_with_the_form_it_declares() {
        let form = Form {
            point: "importer".into(),
            label: Some("Other server".into()),
            fields: vec![field("url"), field("password")],
        };
        let modules = vec![answers("tv.x.reader", "importer", Some(form))];

        let offers = answering(modules, "importer");

        assert_eq!(offers.len(), 1);
        assert_eq!(offers[0].id, "tv.x.reader");
        assert_eq!(offers[0].label.as_deref(), Some("Other server"));
        let keys: Vec<&str> = offers[0].fields.iter().map(|f| f.key.as_str()).collect();
        assert_eq!(keys, vec!["url", "password"]);
        assert!(offers[0].fields[1].secret);
    }

    #[test]
    fn a_module_answering_another_point_is_not_offered() {
        let modules = vec![answers("tv.x.engine", "tv.x.manager/client", None)];

        let offers = answering(modules, "importer");

        assert!(offers.is_empty());
    }

    #[test]
    fn a_module_takes_the_form_of_the_point_asked_for_and_not_of_another_it_answers() {
        let other = Form {
            point: "tv.x.manager/client".into(),
            label: Some("Client".into()),
            fields: vec![field("url")],
        };
        let mut module = answers("tv.x.both", "importer", Some(other));
        module
            .contributes
            .push(("tv.x.manager/client".to_string(), Some("one".to_string())));

        let offers = answering(vec![module], "importer");

        assert_eq!(offers.len(), 1);
        assert_eq!(offers[0].label, None);
        assert!(offers[0].fields.is_empty());
    }
}
