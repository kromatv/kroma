use anyhow::{bail, Result};

use crate::context::Context;
use crate::definition::Login;
use crate::selector;
use crate::{engine, template};

use super::Session;

impl Session {
    /// No-op for public trackers. Verifies via the login `test` selector and
    /// re-logs-in when needed.
    pub fn ensure_login(&self) -> Result<()> {
        let Some(login) = self.def.login.clone() else { return Ok(()) };
        let has_test = login.test.is_some();
        // Without a `test` block there is no cheap way to confirm the session, so
        // a login already done in this process is trusted rather than repeated on
        // every search: trackers count requests.
        if !has_test && self.state.lock().unwrap().logged_in {
            return Ok(());
        }
        if has_test && self.login_ok(&login)? {
            self.state.lock().unwrap().logged_in = true;
            return Ok(());
        }
        // `perform_login` errors if the definition's `error` selectors match,
        // which is the only success signal for logins with no `test` block.
        self.perform_login(&login)?;
        if has_test && !self.login_ok(&login)? {
            bail!("login appeared to succeed but the test check failed");
        }
        self.state.lock().unwrap().logged_in = true;
        Ok(())
    }

    fn login_ok(&self, login: &Login) -> Result<bool> {
        let Some(test) = &login.test else { return Ok(false) };
        let url = self.url_for(test.path.as_deref().unwrap_or(""));
        let html = self.get_text(&url, &[])?;
        match &test.selector {
            Some(sel) => {
                let doc = selector::parse_document(&html);
                Ok(selector::select_first(doc.root_element(), sel).is_some())
            }
            None => Ok(true),
        }
    }

    fn perform_login(&self, login: &Login) -> Result<()> {
        let method = login.method.as_deref().unwrap_or("form");
        let ctx = Context::with_config(&self.def, &self.cfg);
        match method {
            "cookie" => {
                // A user-pasted Cookie header value, applied to every request.
                let cookie = login
                    .inputs
                    .get("cookie")
                    .map(|v| template::render(v, &ctx))
                    .or_else(|| login.cookies.first().map(|c| template::render(c, &ctx)))
                    .unwrap_or_default();
                self.state.lock().unwrap().cookie_header = Some(cookie);
                Ok(())
            }
            "get" => {
                let url = self.url_for(login.path.as_deref().unwrap_or(""));
                let query: Vec<(String, String)> =
                    login.inputs.iter().map(|(k, v)| (k.clone(), template::render(v, &ctx))).collect();
                let html = self.get_text(&url, &query)?;
                self.check_login_errors(login, &html)
            }
            "post" | "getpost" => {
                let path = login.submitpath.clone().or_else(|| login.path.clone()).unwrap_or_default();
                let url = self.url_for(&path);
                let fields: Vec<(String, String)> =
                    login.inputs.iter().map(|(k, v)| (k.clone(), template::render(v, &ctx))).collect();
                let html = self.post_form_text(&url, &fields)?;
                self.check_login_errors(login, &html)
            }
            // "form" (default) and "oneurl": scrape the form, merge inputs, submit.
            _ => self.perform_form_login(login, &ctx),
        }
    }

    fn perform_form_login(&self, login: &Login, ctx: &Context) -> Result<()> {
        let page_url = self.url_for(login.path.as_deref().unwrap_or(""));
        let page = self.get_text(&page_url, &[])?;
        let form_sel = login.form.as_deref().unwrap_or("form");
        let ScrapedForm { action, mut fields } = scrape_form(&page, form_sel, &page_url, &self.rendered_base());

        // Values scraped from named page elements (CSRF tokens, etc).
        {
            let doc = selector::parse_document(&page);
            let root = doc.root_element();
            for (name, sel) in &login.selectorinputs {
                if let Some(s) = &sel.selector {
                    if let Some(el) = selector::select_first(root, s) {
                        let val = match &sel.attribute {
                            Some(a) => selector::element_attr(el, a).unwrap_or_default(),
                            None => selector::element_text(el),
                        };
                        set_field(&mut fields, name, val);
                    }
                }
            }
        }
        // Templated inputs (username/password/…) win over scraped defaults.
        for (name, tmpl) in &login.inputs {
            set_field(&mut fields, name, template::render(tmpl, ctx));
        }

        let html = self.post_form_text(&action, &fields)?;
        self.check_login_errors(login, &html)
    }

    fn check_login_errors(&self, login: &Login, html: &str) -> Result<()> {
        let doc = selector::parse_document(html);
        let root = doc.root_element();
        for err in &login.error {
            if let Some(sel) = &err.selector {
                if let Some(el) = selector::select_first(root, sel) {
                    let msg = err
                        .message
                        .as_ref()
                        .and_then(|m| m.text.clone())
                        .unwrap_or_else(|| selector::element_text(el));
                    bail!("login failed: {}", msg.trim());
                }
            }
        }
        Ok(())
    }
}

struct ScrapedForm {
    action: String,
    fields: Vec<(String, String)>,
}

fn scrape_form(html: &str, form_sel: &str, page_url: &str, base_url: &str) -> ScrapedForm {
    let doc = selector::parse_document(html);
    let root = doc.root_element();
    let form = selector::select_first(root, form_sel).or_else(|| selector::select_first(root, "form"));
    let (action, fields) = match form {
        Some(f) => {
            let action = selector::element_attr(f, "action")
                .filter(|a| !a.is_empty())
                .map(|a| engine::join_url(base_url, &a))
                .unwrap_or_else(|| page_url.to_string());
            let mut fields = Vec::new();
            for input in selector::select_all(f, "input") {
                if let Some(name) = selector::element_attr(input, "name") {
                    let value = selector::element_attr(input, "value").unwrap_or_default();
                    fields.push((name, value));
                }
            }
            (action, fields)
        }
        None => (page_url.to_string(), Vec::new()),
    };
    ScrapedForm { action, fields }
}

fn set_field(fields: &mut Vec<(String, String)>, name: &str, value: String) {
    if let Some(pair) = fields.iter_mut().find(|(k, _)| k == name) {
        pair.1 = value;
    } else {
        fields.push((name.to_string(), value));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrapes_form_action_and_hidden_inputs() {
        let html = r#"
          <form id="login" action="/user/login" method="post">
            <input type="hidden" name="csrf" value="tok123">
            <input type="text" name="username" value="">
            <input type="password" name="password">
          </form>
        "#;
        let form = scrape_form(html, "form#login", "https://x.to/login", "https://x.to/");
        assert_eq!(form.action, "https://x.to/user/login");
        assert_eq!(form.fields.iter().find(|(k, _)| k == "csrf").unwrap().1, "tok123");
        assert!(form.fields.iter().any(|(k, _)| k == "username"));
    }

    #[test]
    fn set_field_overwrites_then_appends() {
        let mut f = vec![("a".to_string(), "1".to_string())];
        set_field(&mut f, "a", "2".into());
        set_field(&mut f, "b", "3".into());
        assert_eq!(f, vec![("a".into(), "2".into()), ("b".into(), "3".into())]);
    }
}
